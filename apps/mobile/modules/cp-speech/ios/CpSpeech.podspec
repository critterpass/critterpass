require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# The fixture-audio input (a WAV file in place of the mic) is compiled into Debug builds and into
# the development variant, whose Release-configured e2e-test builds run the Maestro voice flows;
# store builds (staging, production) never contain it.
fixtures = ENV['APP_VARIANT'] == 'development'

Pod::Spec.new do |s|
  s.name           = 'CpSpeech'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'UNLICENSED'
  s.author         = 'Critterpass'
  s.homepage       = 'https://critterpass.app'
  s.platforms      = { ios: '26.0' }
  s.swift_version  = '6.0'
  s.source         = { path: '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFAudio', 'Speech'

  s.source_files = '**/*.{h,m,swift}'
  s.exclude_files = ['Tests/**/*', 'Package.swift']
  xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }
  xcconfig['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) CP_SPEECH_FIXTURES' if fixtures
  s.pod_target_xcconfig = xcconfig
end
