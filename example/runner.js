var Parser = require( '../src/parser' ),
    Lexer = require( '../src/lexer' ),
    instrument = require( '../src/instrument' ),
    coverage = require( '../src/coverage' ),
    _ = require( 'lodash' );

function doLexer(src) { 
    'use strict';
    
    var lex = new Lexer();
    var t, tokens;
    
    var beginTime = performance.now();

    for( var i = 0; i < 1; ++i ) { 
        tokens = [];
        lex.setInput( src );
        while( ( t = lex.get() ) !== null ) { 
            tokens.push( t );
        }    
    }
    var endTime = performance.now();
   
    document.getElementById( "lexerTime" ).innerHTML = "Tokenize: " + ( ( endTime - beginTime ) / 1.0 ).toFixed( 2 ) + " ms";
}

function tokenText( t ) {
    if( t.type === '(nl)' && !t.value !== ';' ) {
        return "EOL";
    }
    
    return t.value;
}

function tokenClass( t ) { 
    if( t.type === '(nl)' ) { 
        return "nl";
    }
    else if( t.type === "(end)" ) {
        return "eof";
    }
    return t.type;
}

function displayLexResults( tokens ) {
    var frag = document.createDocumentFragment();
    
    var wrapNL = $( '#wrapNL' ).prop( 'checked' );
    
    tokens.forEach( function( t ) { 
        var li = document.createElement("li");
        li.className = tokenClass( t );
        li.textContent = tokenText( t );

        $( li ).attr( { 
            "d-row": "" + (t.line-1), // line is one based -- make zero based row.
            "d-col-from": t.colFrom, 
            "d-col-to": t.colTo + 1 // currently inclusive -- set to 1 passed.  
        } );

        frag.appendChild(li);
        
        if( wrapNL && t.type === '(nl)' && t.value !== ';' ) { 
            frag.appendChild( document.createElement( 'br' ) );
        }
    } );
    
    $( '#tokens ul' ).html( frag );
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

        var validValues = [ "type", 'id', 'value', "default", "name", 'operator', 'left', 'right', 'argument', 'init', "test", 'first', 'second', 'third', 'fourth', 'direction', 'label', 'declaration', "dataType",  "kind", "returnType" ];
        var groupValues = [ "params", "arguments", "body", "consequent", "alternate", "elements", "expression", "declarations", "declarations" ];
        
        validValues = validValues.concat( groupValues );
        
        var indexPosVals = [ "range" ];
        var relativePosVals = [ "start", "end", "col", "line", "loc" ];
        
        if( $( '#lineColBased' ).prop( "checked" ) ) { 
            validValues = validValues.concat( relativePosVals );
        }        
        if( $( '#indexBased' ).prop( "checked" ) ) { 
            validValues = validValues.concat( indexPosVals );
        }        
        
        msg = JSON.stringify( tree, validValues, 3 );
    } catch (e) {
        endTime = performance.now();
        msg = JSON.stringify( e );
    }
    
    displayLexResults( parser.getTokens() );    
    
    document.getElementById( "parseTime" ).innerHTML = "Parse: " + ( endTime - beginTime ).toFixed( 2 ) + " ms";
    
    document.getElementById( 'results' ).innerHTML = msg
            .replace(/&/g, '&amp;')
            .replace(/[<]/g, '&lt;');
}

function doInstrument(editor) {
    var parser = Parser(),
        source = editor.getValue();
    
    try {
        var tree = parser.parse( source );
        var result = instrument( "path.", parser.getSource(), tree );
        editor.setValue( result );
    } catch (e) {
        window.alert( e.message );
    }
}

function doCodeCoverage(editor) {
    var parser = Parser(),
        source = editor.getValue();
    
    try {
        var tree = parser.parse( source );
        var result = coverage( "path.", parser.getSource(), tree );
        editor.setValue( result );
    } catch (e) {
        window.alert( e.message );
    }
}

$( function() { 
    var editor = ace.edit("editor");

    function doParse() { 
        var v = editor.getValue();
        go( v );
    }

    $( '#tokenList' ).delegate( 'li', 'click', function() { 
        // fix warnings.
        editor.$blockScrolling = Infinity;
        editor.setAnimatedScroll( true );

        var $el = $( this );
        
        var row = parseInt( $el.attr( 'd-row' ),10 ),
            fromCol = parseInt( $el.attr( 'd-col-from' ), 10 ), 
            toCol = parseInt( $el.attr( 'd-col-to' ), 10 );
        
        var sel = editor.selection;
        var newSel = { start: { row: row, column: fromCol }, end: { row: row, column: toCol } };
        
        editor.scrollToLine( row, false, true, function() {} );
        sel.setSelectionRange( newSel );
        editor.focus();
    } );
    
    $( '#indexBased' ).click( function() { 
    
    } );
    
    $( '#instrument' ).click( function() { 
        doInstrument( editor );
    } );

    $( '#codecoverage' ).click( function() { 
        doCodeCoverage( editor );
    } );
    
    $( '#wrapNL,#indexBased,#lineColBased' ).click( doParse );
    
    var throttledParse = _.debounce( doParse, 1000 );
    editor.on( 'change', throttledParse );
    
    doParse();
} );