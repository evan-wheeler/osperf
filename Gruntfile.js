module.exports = function(grunt) {
    "use strict";

    grunt.initConfig({
        clean: {},

        run: {
            peg: {
                cmd: "pegjs.cmd",
                args: ["-o", "./src/sqlparser.js", "./src/assets/grammar.pegjs"]
            }
        },

        browserify: {
            example: {
                src: ["./example/runner.js"],
                dest: "./example/profiler.js"
            },
            report: {
                src: ["./src/pretty.js"],
                dest: "./src/commands/assets/includes/pretty.js"
            }
        },

        jshint: {
            all: ["Gruntfile.js", "src/*.js", "profiler.js"],
            options: {}
        }
    });

    // Load local tasks.
    // grunt.loadTasks("tasks");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-browserify");
    grunt.loadNpmTasks("grunt-run");

    // Default task.
    grunt.registerTask("default", ["jshint", "browserify"]);
};
