var Parser = require( '../src/parser' ),
    Lexer = require( '../src/lexer' );

Object.prototype.error = function (message, t) {
    t = t || this;
    t.name = "SyntaxError";
    t.message = message;
    throw t;
};

function doLexer(src) { 
    'use strict';
    
    var lex = new Lexer();
    lex.setInput( src );
    var t;
    var tokens = [];
    
    var beginTime = performance.now();
    while( ( t = lex.get() ) !== null ) { 
        tokens.push( t );
    }    
    var endTime = performance.now();
    
    var items = tokens.map( function( v ) { 
        return JSON.stringify( v, [ "type", "value" ] );
    } );

    document.getElementById( "lexerTime" ).innerHTML = "Tokenize: " + ( endTime - beginTime ).toFixed( 2 ) + " ms";
    document.getElementById( 'tokens' ).innerHTML = items.join( "<br>" );
}

function go(source) {
    var msg, tree;
    var beginTime = 0, endTime = 0;

    doLexer(source);
    
    var parser = Parser();
    
    try {
        beginTime = performance.now();
        tree = parser.parse( source );
        endTime = performance.now();

        msg = JSON.stringify( tree, [ 'arity', 'value', 'left', 'right', 'first', 'second', 'third', 'fourth', 'direction', 'label', 'id', 'declaration', "dataType", "returnType", "name" ], 4 );
    } catch (e) {
        endTime = performance.now();
        msg = JSON.stringify( e );
    }
    
    document.getElementById( "parseTime" ).innerHTML = "Parse: " + ( endTime - beginTime ).toFixed( 2 ) + " ms";
    
    document.getElementById( 'results' ).innerHTML = msg
            .replace(/&/g, '&amp;')
            .replace(/[<]/g, '&lt;');
}

$( function() { 
    $( '#input' ).change( function() { 
        go( $( this ).val() );
    } );
} );