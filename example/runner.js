var Bannockburn = require( '../../bannockburn'),
    profiler = require( '../src/instrument/profile' ),
    coverage = require( '../src/instrument/coverage' ),
    IDGen = require( '../src/idgen'),
    _ = require( 'lodash' );

var Lexer = Bannockburn.Lexer,
    Parser = Bannockburn.Parser,
    Walker = Bannockburn.Walker;

window.Walker = Walker;
window.Parser = Parser();

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
            "d-row-from": "" + (t.loc.start.line-1), // line is one based -- make zero based row.
            "d-row-to": "" + (t.loc.end.line-1), // line is one based -- make zero based row.
            "d-col-from": t.loc.start.col,
            "d-col-to": t.loc.end.col + 1 // currently inclusive -- set to 1 passed.
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

        var validValues = [ "type", 'id', 'value', "default", "name", 'operator', 'left', 'right', 'object', 'callee', 'property', 'argument', 'init', "test", 'first', 'second', 'third', 'fourth', 'direction', 'label', 'declaration', "dataType",  "kind", "returnType", "discriminant" ];
        var groupValues = [ "cases", "params", "arguments", "body", "consequent", "alternate", "elements", "expression", "declarations", "declarations" ];
        
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

        $( '#error').hide();

        document.getElementById( 'results' ).innerHTML = msg
            .replace(/&/g, '&amp;')
            .replace(/[<]/g, '&lt;');

    } catch (e) {
        endTime = performance.now();

        var positionInfo = "";

        if(e.token )  {
            positionInfo = ", line: " + e.token.loc.start.line + ", column: " + e.token.loc.start.col;
        }

        $( '#error').html(e.name + ": " + e.message + positionInfo );
        $( '#error').show();
    }
    
    displayLexResults( parser.getTokens() );    
    
    document.getElementById( "parseTime" ).innerHTML = "Parse: " + ( endTime - beginTime ).toFixed( 2 ) + " ms";
    
}

function doInstrument(editor) {
    var parser = Parser(),
        source = editor.getValue(),
        gen = new IDGen(),
        scriptID = "path.";

    function funcIDGen( name ) {
        return gen.newID( scriptID + name );
    }
    
    try {
        var tree = parser.parse( source );
        var result = profiler( parser.getSource(), tree, funcIDGen );
        editor.setValue( result );

        console.log( "ID decodes: ", gen.getIDs() );

    } catch (e) {
        window.alert( e.message );
    }
}

function doCodeCoverage(editor) {
    var parser = Parser(),
        gen = new IDGen(),
        scriptID = "path.",
        source = editor.getValue();

    function blockIDGen( info ) {
        return gen.newID( scriptID + info.func + "[" + info.block + "]" );
    }

    try {
        var tree = parser.parse( source );
        var result = coverage( parser.getSource(), tree, blockIDGen );
        editor.setValue( result.result );

        console.log( "Functions: ", result.functions );
        console.log( "Blocks: ", result.blocks );

    } catch (e) {
        window.alert( e.message );
    }
}

$( function() { 
    var editor = ace.edit("editor");
    editor.setTheme( "ace/theme/eclipse" );

    function doParse() { 
        var v = editor.getValue();
        go( v );
    }

    $( '#tokenList' ).delegate( 'li', 'click', function() { 
        // fix warnings.
        editor.$blockScrolling = Infinity;
        editor.setAnimatedScroll( true );

        var $el = $( this );
        
        var fromRow = parseInt( $el.attr( 'd-row-from' ),10 ),
            toRow = parseInt( $el.attr( 'd-row-to' ), 10 ),
            fromCol = parseInt( $el.attr( 'd-col-from' ), 10 ),
            toCol = parseInt( $el.attr( 'd-col-to' ), 10 );
        
        var sel = editor.selection;
        var newSel = { start: { row: fromRow, column: fromCol }, end: { row: toRow, column: toCol } };
        
        editor.scrollToLine( fromRow, false, true, function() {} );
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

    editor.selection.on( 'changeCursor', function() {
        var pos = editor.getCursorPosition();
        $( '#cursor-pos').html( "Line: " + (1+pos.row) + ", Col: " + pos.column );
    } );

    var throttledParse = _.debounce( doParse, 1000 );
    editor.on( 'change', throttledParse );
    
    doParse();
} );