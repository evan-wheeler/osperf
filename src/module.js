var glob = require("glob"),
  path = require("path"),
  fs = require("fs");

function Module(modName, baseDir) {
  this.baseDir = baseDir;
  this.module = modName;

  var src_path = path.join(baseDir, modName, "ospace_src", path.sep);

  if (!fs.existsSync(src_path)) {
    src_path = path.join(baseDir, modName, "ospaces_src", path.sep);

    if (!fs.existsSync(src_path)) {
      throw Error(
        "Module source directory could not be found for base directory: " +
          baseDir +
          ", module name: " +
          modName
      );
    }
  }

  this.source_path = src_path;
  this.multiOspaceModule = src_path.indexOf("ospaces_src") !== -1;
}

Module.prototype.getScripts = function() {
  return glob.sync(this.source_path + "**/*.Script");
};

Module.prototype.getStartupScripts = function() {
  var globSearch =
    this.source_path +
    (this.multiOspaceModule
      ? "*/*Root/Startup.Script"
      : "*Root/Startup.Script");

  return glob.sync(globSearch).filter(function(file) {
    // filter a little more precisely...
    return /.*[\\/][ a-zA-Z0-9_]+[ ]?Root[\\/]Startup\.Script$/.test(file);
  });
};

module.exports = Module;
