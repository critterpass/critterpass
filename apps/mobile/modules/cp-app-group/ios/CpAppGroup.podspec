Pod::Spec.new do |s|
  s.name           = 'CpAppGroup'
  s.version        = '1.0.0'
  s.summary        = 'Bridges JS to the shared App Group container'
  s.description    = 'Writes snapshots/images into the App Group container and reads the shared outbox extensions leave behind.'
  s.author         = 'Critterpass'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  # Host-side SwiftPM tests of the store (swift test --package-path …/ios), never part of the app.
  s.exclude_files = ["Package.swift", "Tests/**/*"]
end
