require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'CpDeferredLink'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'UNLICENSED'
  s.author         = 'Critterpass'
  s.homepage       = 'https://critterpass.app'
  s.platforms      = { ios: '16.4' }
  s.swift_version  = '6.0'
  s.source         = { path: '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.exclude_files = 'Tests/**/*'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
  end
end
