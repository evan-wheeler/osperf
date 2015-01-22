// preproccessor.js
var util = require( './util' ),
    DirectiveStack = require( './directive_stack' ),
    Macros = require( './macros' );
    
var token_error = function ( t, message ) {
    t.type = "SyntaxError";
    t.message = message || "Unknown or erroneous preproccessor directive";
    throw t;
};

var macros,
    directiveStack,
    tokens = [],
    token = null,
    tokenIndex = 0,
    findDirective = true,
    results = [],
    usingTokens = true;

var advance = function( evalToken ) { 
    if( token && evalToken && directiveStack.on() ) {
        if( macros.isDefined( token ) ) { 
            try {
                results.push.apply( results, macros.evaluate( token ) );
            }
            catch( e ) { 
                token_error( token, "Recursive macro definition can't be evaluated" );
            }
        }
        else {
            results.push( token );
        }
    }   
    
    if( tokenIndex >= tokens.length ) { 
        token = null;
        return;
    }        
    
    token = tokens[tokenIndex++];
};

function isValidMacroName( tok ) { 
    return tok && tok.type === 'name';
}

var directives = { 
    "define": function(t,args) {
        if( directiveStack.on() ) { 
            if( isValidMacroName( args[0] ) ) { 
                macros.define( args[0], args.slice( 1 ) );
            }
        }
    },
    "undef": function(t,args) { 
        if( directiveStack.on() ) { 
            macros.undef( args[0] );
        }
    },
    "ifdef": function(t,args) { 
        directiveStack.push( macros.isDefined( args[0] ) );
    },
    "ifndef": function(t, args ) { 
        directiveStack.push( !macros.isDefined( args[0] ) );
    },
    "else": function(t,args) {             
        if( directiveStack.empty() ) {
            token_error(t);
        }
        directiveStack.invert();
    },
    "endif": function(t,args) { 
        if( directiveStack.empty() ) {
            token_error( t );
        }
        directiveStack.pop();
    }
};

function directive() { 
    if( token.type === 'name' ) { 
        var t = token,
            v = t.value.toLowerCase(),
            dir = directives[ v ],
            params = [];
            
        // collect all tokens until eol.
        while( true ) { 
            advance(false);
            
            if( !token ) {
                break;
            }
            else if ( isNewline( token ) ) {
                advance(false);
                break;
            }

            params.push( token );
        }
        
        // process the directive.
        if( dir ) { 
            dir( t, params );
        }
        else if( directiveStack.on() ) {
            // throw error if we're collecting tokens.
            token_error( token );
        }
    }
    else {
        if( directiveStack.on() ) { 
            // this is an error if we're collecting tokens.
            token_error( token );
        }
        else {      
            // if we're not collecting tokens, we can skip to end of line.
            while( token && !isNewline( token ) ) { 
                advance(false);
            }
            
            if ( isNewline( token ) ) {
                // one more.
                advance(false);
            }
        }
    }
}    

function isNewline( t ) { 
    return t && t.type === "(nl)" && t.value !== ';';
}

function preprocess(tokenList) { 
    // reset our globals
    directiveStack = new DirectiveStack();
    
    macros = new Macros( { 
                    canEvalItem: isValidMacroName, 
                    valueFn: function(t) { return typeof( t ) === 'undefined' ? null : t.value; } 
                } );
    
    tokens = tokenList;
    tokenIndex = 0;
    token = null;
    results = [];

    // start by finding directives
    var findDirective = true;

    // load first token.
    advance();

    while( token ) { 
        if( findDirective ) { 
            // # - is a directive line.
            // Real newlines are skipped.
            // Any other token switches to normal processing...
            
            if( token.type === 'operator' && token.value === '#' ) { 
                advance(false);
                directive();
            }
            else if( isNewline( token ) ) { 
                advance(true);
            }
            else { 
                // process this token in the next loop.
                findDirective = false;
            }
        }
        else {
            // normal code mode... newlines switch the state back to finding directives.
            if( token.type === "(nl)" && token.value !== ';' ) {
                findDirective = true;
            }
            advance(true);
        }
    }
    
    return results;
}

module.exports = { 
    run: preprocess
};
