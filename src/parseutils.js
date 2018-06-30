var Q = require("q"),
    fs = require("fs"),
    async = require("async"),
    Bannockburn = require("bannockburn"),
    walk = require("./walk"),
    webscript = require("./webscript");

var cat = function(a, i) {
    return a.concat(i);
};

var exports = module.exports;

/* Common functions */

exports.listScriptsInModules = function(modules) {
    return Q.nfcall(async.map, modules, function(mod, cb) {
        let scripts = mod.getScripts();
        let html = mod.getHTML();
        let all = [].concat(html, scripts);
        cb(null, all);
    }).then(function(results) {
        return results.reduce(cat, []);
    });
};

const parseOptions = {
    additional_types: ["GUID"]
};

exports.parseFile = function(filename) {
    return Q.nfcall(fs.readFile, filename, "utf-8").then(function(content) {
        if (_.endsWith(filename.toLowerCase(), ".html")) {
            let htmlContent = webscript(content);
            content = htmlContent[0].join("\n");
        }

        parser = Bannockburn.Parser(parseOptions);
        var ast = parser.parse(content);

        return {
            src: parser.getSource(),
            ast: ast
        };
    });
};

exports.getASTNode = function(v) {
    if (v) {
        if (_.isArray(v)) {
            return v[0];
        } else {
            return v;
        }
    }
    return null;
};

exports.addSource = function(ast, code) {
    function visit(node) {
        if (!node) {
            return;
        }

        // remove artifacts from the (very strange) parser.
        delete node.led;
        delete node.nud;
        delete node.scope;
        delete node.parent;
        delete node.labels;
        delete node.std;

        if (node.range) {
            node.code = code.substring(node.range[0], node.range[1] + 1);
        }

        return visit;
    }

    walk(visit, ast);
};
