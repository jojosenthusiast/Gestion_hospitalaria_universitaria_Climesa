import SwiftUI
@main struct CLIMESAApp:App {
    @StateObject private var account=AccountModel()
    @Environment(\.scenePhase) private var phase
    @State private var leftAt:Date?
    var body:some Scene {
        WindowGroup {
            RootView().environmentObject(account).tint(Brand.blue).preferredColorScheme(.light)
                .task { await account.restore() }
                .onChange(of:phase) { _,value in
                    if value == .background { leftAt=Date() }
                    else if value == .active, let since=leftAt {
                        leftAt=nil
                        Task { if Date().timeIntervalSince(since)>300 { await account.logout() } else { await account.restore() } }
                    }
                }
        }
    }
}
