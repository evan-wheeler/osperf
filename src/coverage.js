var util = require( './util' );

module.exports = function coverage( path, src, parseTree ) {
    
    return "/* Code Coverage */\n" + src;    
};