import Foundation

/// The two calls the screen view models make to the API: an authenticated read and a write with the intent's
/// `Idempotency-Key`. The app's `APIClient` conforms (CLIMESA/Network.swift); tests use a fake, so a view model is
/// tested without network. The view model builds the method, path and body; views never do.
public protocol ClinicalAPI: Sendable {
    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T
    func send<Body: Encodable, T: Decodable>(_ method: String, _ path: String, body: Body, key: String, as type: T.Type) async throws -> T
}

/// How a view model reaches the API. A view creates its view model in `@State` before the session is known, so the
/// client is resolved on every call (no client yet means the call fails with `APIFailure.transport`, like before).
public typealias ClinicalAPIProvider = @MainActor () throws -> any ClinicalAPI
