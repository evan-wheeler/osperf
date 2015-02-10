module.exports = function (grunt) {
  'use strict';
  
  grunt.initConfig({

    clean: {
    },
    
    browserify: {
        debug: {
            src: [ "./example/runner.js" ],
            dest: "./example/profiler.js"
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


