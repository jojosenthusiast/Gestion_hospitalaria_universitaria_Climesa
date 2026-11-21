// swift-tools-version: 5.9
import PackageDescription
// macOS 14: Core/Screen and Core/ViewModels use Observation (@Observable), like the iOS 17 app.
// Fixtures/contract: request bodies the API contract tests validate against contrato/openapi.json (ContractFixtureTests).
let package = Package(name: "ClimesaCore", platforms: [.iOS(.v17), .macOS(.v14)], products: [.library(name: "ClimesaCore", targets: ["ClimesaCore"])], targets: [.target(name: "ClimesaCore", path: "Core"), .testTarget(name: "CoreTests", dependencies: ["ClimesaCore"], path: "Tests/CoreTests", resources: [.copy("Fixtures")])])
