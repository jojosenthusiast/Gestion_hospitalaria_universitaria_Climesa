// swift-tools-version: 5.9
import PackageDescription
// Fixtures/contract: request bodies the API contract tests validate against contrato/openapi.json (ContractFixtureTests).
let package = Package(name: "ClimesaCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "ClimesaCore", targets: ["ClimesaCore"])], targets: [.target(name: "ClimesaCore", path: "Core"), .testTarget(name: "CoreTests", dependencies: ["ClimesaCore"], path: "Tests/CoreTests", resources: [.copy("Fixtures")])])
