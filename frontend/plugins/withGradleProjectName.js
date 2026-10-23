const { withSettingsGradle } = require('expo/config-plugins');

/**
 * Gradle 项目名不能以「.」结尾，App 名字「us.」不能直接拿来当 rootProject.name。
 * 只改 Gradle 内部的项目名，桌面上显示的名字仍是「us.」。
 */
module.exports = function withGradleProjectName(config, name = 'us') {
  return withSettingsGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(/rootProject\.name\s*=\s*['"][^'"]*['"]/, `rootProject.name = '${name}'`);
    return mod;
  });
};
