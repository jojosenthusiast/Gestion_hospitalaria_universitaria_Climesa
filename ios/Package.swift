// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "ClimesaCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "ClimesaCore", targets: ["ClimesaCore"])], targets: [.target(name: "ClimesaCore", path: "Core"), .testTarget(name: "CoreTests", dependencies: ["ClimesaCore"], path: "Tests/CoreTests")])
