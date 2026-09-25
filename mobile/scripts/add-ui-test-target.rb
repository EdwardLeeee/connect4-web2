# Add the AppUITests UI-test target and a shared App scheme to the Xcode project on the
# CI runner, so the committed project stays exactly what Capacitor generates.
# Usage: ruby mobile/scripts/add-ui-test-target.rb mobile/ios/App/App.xcodeproj
require "xcodeproj"

project_path = ARGV.fetch(0)
tests = File.expand_path("../UITests/AppUITests.swift", File.dirname(project_path))
abort "missing #{tests}" unless File.file?(tests)

project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == "App" } or abort "no App target"
abort "AppUITests already exists" if project.targets.any? { |target| target.name == "AppUITests" }

ui_tests = project.new_target(:ui_test_bundle, "AppUITests", :ios, "15.0", nil, :swift)
ui_tests.add_dependency(app)
group = project.main_group.new_group("AppUITests")
ui_tests.add_file_references([group.new_reference(tests)])
ui_tests.build_configurations.each do |config|
  config.build_settings.merge!(
    "TEST_TARGET_NAME" => "App",
    "PRODUCT_BUNDLE_IDENTIFIER" => "com.oraclelee.connect4.uitests",
    "GENERATE_INFOPLIST_FILE" => "YES",
    "SWIFT_VERSION" => "5.0",
    "TARGETED_DEVICE_FAMILY" => "1",
    "CODE_SIGN_STYLE" => "Automatic",
  )
end
project.save

scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, ui_tests, launch_target: true)
scheme.save_as(project_path, "App", true)
puts "added AppUITests and the shared App scheme to #{project_path}"
