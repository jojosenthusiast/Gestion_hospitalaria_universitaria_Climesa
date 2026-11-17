import Foundation

/// A deferred `POST`, stored from the tap until the server confirms it or the person undoes it (D-3). `id` is its
/// `Idempotency-Key`: every resend of this body reuses it. `subject` is what it acts on (a ticket id).
public struct DeferredRequest: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public let subject: String
    public let label: String
    public let path: String
    /// The JSON body frozen at the tap: a retry is an exact replay (same key, same body).
    public var body: Data
    public let tappedAt: Date
    public let dueAt: Date
    /// Last failure kept for a retry (no signal, 5xx, 401, 408, 429).
    public var error: String?
    /// The body was already rebuilt once after `version_conflicto`.
    public var rebased: Bool

    public init(id: String, subject: String, label: String, path: String, body: Data, tappedAt: Date, dueAt: Date, error: String? = nil, rebased: Bool = false) {
        self.id = id; self.subject = subject; self.label = label; self.path = path; self.body = body
        self.tappedAt = tappedAt; self.dueAt = dueAt; self.error = error; self.rebased = rebased
    }
}

/// What a failed send means for a deferred request.
public enum DeferredFailure: Equatable, Sendable {
    /// Resending the same request may work later (no signal, 5xx, 401, 408, 429): it stays stored.
    case keep
    /// The server rejected it for good (any other 4xx): it is dropped and reported once.
    case drop
    /// 409 `version_conflicto`: the subject is read again and a NEW body goes under a NEW key, once.
    case rebase
}

public enum DeferredRules {
    /// D-3: 8 s to undo before the request is sent.
    public static let window: TimeInterval = 8
    /// A stored request older than this by its tap time is dropped and reported (Android `MAX_AGE_MS`).
    public static let maxAge: TimeInterval = 24 * 3600

    public static func classify(_ failure: APIFailure, rebased: Bool) -> DeferredFailure {
        if failure.isVersionConflict && !rebased { return .rebase }
        switch failure {
        case let .http(status, _) where (400..<500).contains(status) && ![401, 408, 429].contains(status): return .drop
        default: return .keep
        }
    }

    /// No answer from the server: the later requests wait too.
    public static func stopsAll(_ failure: APIFailure) -> Bool { failure == .transport }
}

/// Requests held for `window` seconds before they are sent, so «Deshacer» cancels them without any API call.
/// - Persisted at the tap (`save`), so a killed app or a lost signal never loses one; `resume()` sends what is due.
/// - A retry is an exact replay; a definitive 4xx is dropped and reported once; `version_conflicto` is rebased once with a
///   new body and a new key; a new action settles only the waiting action of the same subject; age counts from the tap.
@MainActor
public final class DeferredQueue {
    public typealias Send = @MainActor (DeferredRequest) async throws -> Void
    /// Reads the subject again and returns the new body, or nil when the action no longer applies. Throwing (the read
    /// failed) keeps the request stored for a retry.
    public typealias Rebase = @MainActor (DeferredRequest) async throws -> Data?

    public private(set) var items: [DeferredRequest]
    /// Ids still inside their undo window.
    private var open: Set<String> = []
    private var timers: [String: Task<Void, Never>] = [:]
    private var draining = false
    private var drainAgain = false

    private let window: TimeInterval
    private let now: @MainActor () -> Date
    private let makeKey: @MainActor () -> String
    private let save: @MainActor ([DeferredRequest]) -> Void
    private let send: Send
    private let rebase: Rebase
    private let autoTimers: Bool

    /// Called after every change of what is waiting or stored.
    public var onChange: @MainActor () -> Void = {}
    /// A request the server accepted.
    public var onSent: @MainActor (DeferredRequest) -> Void = { _ in }
    /// A message to show once: a request dropped for good, or one that expired.
    public var onReport: @MainActor (String) -> Void = { _ in }

    public init(stored: [DeferredRequest], window: TimeInterval = DeferredRules.window, autoTimers: Bool = true,
                now: @escaping @MainActor () -> Date = { Date() },
                makeKey: @escaping @MainActor () -> String = { UUID().uuidString.lowercased() },
                save: @escaping @MainActor ([DeferredRequest]) -> Void, send: @escaping Send, rebase: @escaping Rebase = { _ in nil }) {
        self.items = stored.sorted { $0.tappedAt < $1.tappedAt }
        self.window = window; self.autoTimers = autoTimers; self.now = now; self.makeKey = makeKey
        self.save = save; self.send = send; self.rebase = rebase
    }

    /// Requests inside their undo window, in tap order.
    public var pending: [DeferredRequest] { items.filter { open.contains($0.id) } }

    /// Stored requests whose last send failed and that wait for a retry.
    public var failed: [DeferredRequest] { items.filter { $0.error != nil && !open.contains($0.id) } }

    public func isPending(_ subject: String) -> Bool { items.contains { $0.subject == subject && open.contains($0.id) } }

    /// Stored at the tap. A waiting request on the same subject is sent first; other subjects keep their own undo.
    @discardableResult
    public func start(subject: String, label: String, path: String, body: Data) async -> DeferredRequest {
        if closeWindows(subject) { await drain() }
        let tap = now()
        let item = DeferredRequest(id: makeKey(), subject: subject, label: label, path: path, body: body, tappedAt: tap, dueAt: tap.addingTimeInterval(window))
        items.append(item)
        open.insert(item.id)
        persist()
        schedule(item.id, after: window)
        onChange()
        return item
    }

    /// «Deshacer»: drops the waiting request of `subject`; true when one was waiting (nothing reached the server).
    @discardableResult
    public func undo(_ subject: String) -> Bool {
        guard let item = items.last(where: { $0.subject == subject && open.contains($0.id) }) else { return false }
        timers.removeValue(forKey: item.id)?.cancel()
        open.remove(item.id)
        items.removeAll { $0.id == item.id }
        persist()
        onChange()
        return true
    }

    /// The person drops a failed request after reading its error.
    public func discard(_ id: String) {
        guard !open.contains(id) else { return }
        items.removeAll { $0.id == id }
        persist()
        onChange()
    }

    /// Ends the window of `subject` only and waits for its answer, so another action on it never overtakes it.
    public func settle(_ subject: String) async {
        _ = closeWindows(subject)
        await drain()
    }

    /// App start, screen back, signal back: expired requests (by tap time) are dropped and reported; a request still
    /// inside its window waits only for the rest of it; the others are sent in tap order.
    public func resume() async {
        let t = now()
        let expired = items.filter { !open.contains($0.id) && $0.tappedAt < t.addingTimeInterval(-DeferredRules.maxAge) }
        if !expired.isEmpty {
            items.removeAll { item in expired.contains { $0.id == item.id } }
            persist()
            for item in expired { onReport("\(item.label): no se envió a tiempo y se descartó.") }
        }
        for item in items where !open.contains(item.id) && item.error == nil && item.dueAt > t {
            open.insert(item.id)
            schedule(item.id, after: item.dueAt.timeIntervalSince(t))
        }
        onChange()
        await drain()
    }

    /// Closes the windows that are due by the clock and sends them. The timers call it; tests call it with their clock.
    public func tick() async {
        let t = now()
        let due = items.filter { open.contains($0.id) && $0.dueAt <= t }
        guard !due.isEmpty else { await drain(); return }
        for item in due { open.remove(item.id); timers.removeValue(forKey: item.id)?.cancel() }
        onChange()
        await drain()
    }

    private func closeWindows(_ subject: String) -> Bool {
        let ending = items.filter { $0.subject == subject && open.contains($0.id) }
        guard !ending.isEmpty else { return false }
        for item in ending { open.remove(item.id); timers.removeValue(forKey: item.id)?.cancel() }
        onChange()
        return true
    }

    private func schedule(_ id: String, after seconds: TimeInterval) {
        guard autoTimers else { return }
        timers[id]?.cancel()
        let nanos = UInt64(max(0, seconds) * 1_000_000_000)
        timers[id] = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: nanos)
            guard !Task.isCancelled, let self else { return }
            await self.tick()
        }
    }

    /// Sends in tap order. A kept failure holds back the later requests of the same subject; no signal stops all.
    private func drain() async {
        if draining { drainAgain = true; return }
        draining = true
        defer { draining = false }
        repeat {
            drainAgain = false
            var held: Set<String> = []
            for queued in items where !open.contains(queued.id) {
                guard !held.contains(queued.subject), items.contains(where: { $0.id == queued.id }), !open.contains(queued.id) else { continue }
                if await sendOne(queued) == false { held.insert(queued.subject) }
                if stopped { stopped = false; return }
            }
        } while drainAgain
    }

    private var stopped = false

    /// True when the request left the store (sent, dropped or rebased away), false when it stays for a retry.
    private func sendOne(_ first: DeferredRequest) async -> Bool {
        var item = first
        while true {
            do {
                try await send(item)
                remove(item.id)
                onSent(item)
                return true
            } catch is CancellationError {
                return false
            } catch {
                let failure = (error as? APIFailure) ?? .transport
                switch DeferredRules.classify(failure, rebased: item.rebased) {
                case .rebase:
                    let fresh: Data?
                    do { fresh = try await rebase(item) } catch {
                        let reread = (error as? APIFailure) ?? .transport
                        var kept = item
                        kept.error = reread.message
                        replace(item.id, with: kept)
                        if DeferredRules.stopsAll(reread) { stopped = true }
                        return false
                    }
                    guard let body = fresh else {
                        remove(item.id)
                        onReport("\(item.label): ya cambió y no se envió.")
                        return true
                    }
                    // New body, new key: the old key never carries a second body.
                    var next = item
                    next.id = makeKey(); next.body = body; next.error = nil; next.rebased = true
                    replace(item.id, with: next)
                    item = next
                case .drop:
                    remove(item.id)
                    onReport("\(item.label): \(failure.message)")
                    return true
                case .keep:
                    var kept = item
                    kept.error = failure.message
                    replace(item.id, with: kept)
                    if DeferredRules.stopsAll(failure) { stopped = true }
                    return false
                }
            }
        }
    }

    private func remove(_ id: String) {
        items.removeAll { $0.id == id }
        persist()
        onChange()
    }

    private func replace(_ id: String, with item: DeferredRequest) {
        items = items.map { $0.id == id ? item : $0 }
        persist()
        onChange()
    }

    private func persist() { save(items) }
}
