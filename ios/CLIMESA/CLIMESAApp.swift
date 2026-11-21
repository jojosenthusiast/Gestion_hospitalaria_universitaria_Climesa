import SwiftUI
@main struct CLIMESAApp:App {
    @StateObject private var account=AccountModel()
    @Environment(\.scenePhase) private var phase
    @State private var leftAt:Date?
    /// Atkinson and the brand colours in the UIKit bars; the app follows the system light or dark mode (web parity).
    init() { ClimesaAppearance.apply() }
    var body:some Scene {
        WindowGroup {
            RootView().environmentObject(account).tint(Theme.primaryText)
                .safeAreaInset(edge:.bottom) { ServerWakeBanner() }
                .task { await account.restore() }
                .onChange(of:phase) { _,value in
                    if value == .background { leftAt=Date() }
                    else if value == .active, let since=leftAt {
                        leftAt=nil
                        Task { if Date().timeIntervalSince(since)>300 { await account.logout() } else { await account.resume() } }
                    }
                }
        }
    }
}
