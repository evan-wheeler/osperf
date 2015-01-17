var fs = require( 'fs' ),
    Parser = require( './src/parser' );

Object.prototype.error = function (message, t) {
    t = t || this;
    t.name = "SyntaxError";
    t.message = message;
    throw t;
};

function go(source) {
    var msg, tree;

    try {
        tree = Parser(source);
        msg = JSON.stringify(tree, ['key', 'name', 'message',
            'value', 'arity', 'first', 'second', 'third', 'fourth'], 4);
    } catch (e) {
        msg = JSON.stringify(e, ['name', 'message', 'from', 'to', 'key',
                'value', 'arity', 'first', 'second', 'third', 'fourth'], 4);
    }
    
    console.log( msg );
}
    
if( process.argv.length > 2 ) {
    var fname = process.argv[2];
    
    var code = fs.readFileSync( fname, { encoding: 'utf8' } );
    
    if( code ) {
        console.log( code );

        go( code );
        
        console.log( "done" );
    }    
}
