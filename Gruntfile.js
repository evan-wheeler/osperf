module.exports = function (grunt) {
  'use strict';
  
  grunt.initConfig({

    clean: {
    },
    
    browserify: {
        example: {
            src: [ "./example/runner.js" ],
            dest: "./example/profiler.js"
        },
        report: {
            src: [ "./src/pretty.js" ],
            dest: "./src/commands/assets/includes/pretty.js"
        }
    },

    jshint: {
      all: ['Gruntfile.js', 'src/*.js', 'profiler.js'],
      options: {
      }
    }
  });

  // Load local tasks.
  grunt.loadTasks('tasks');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-browserify');

  // Default task.
  grunt.registerTask('default', ['jshint','browserify']);
};


