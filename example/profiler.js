(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

        msg = JSON.stringify( tree, [ 'arity', 'value', 'left', 'right', 'third', 'first', 'second', 'third', 'id', 'declaration', "dataType", "returnType", "name" ], 4 );
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
},{"../src/lexer":2,"../src/parser":3}],2:[function(require,module,exports){
function Lexer(){ 
    this.code = ""; 
    this.pos = 0;
}

module.exports = Lexer;

var LINE_COMMENT = 1,
    BLOCK_COMMENT = 2,
    SINGLE_STR = 3,
    DOUBLE_STR = 4,
    VARIABLE = 5,
    NUMBER_NO_DECIMAL = 6,
    NUMBER_DECIMAL = 7,
    CONTINUATION = 8,
    ELLIPSIS = 9;

function makeToken( t, v, line, from, to ) { 
    return { type: t, value: v, line: line, from: from, to: to };
}
    
Lexer.prototype = { 
    setInput: function( code ) {
        this.code = code;
        this.line = 1;
        this.pos = 0;
        this.line_pos = 0;
        this.done = ( this.code.length === 0 );
        this.curToken = null;
        this.buffer = [];
    },
    
    readNextToken: function() { 
    
        var result = null, token = "", state = 0, eof = false, eat = false;
        var continuation = false;
        var nlInComment = false;
        var ch = this.code.charAt( this.pos );
        var ch1 = this.code.charAt( this.pos + 1 );
        var from = this.pos;
        var addCommentNewline = false;
        
        if( ch1 === "" ) { 
            eof = true;
            this.pos++;
            ch1 = '\n';
        }
        
        if( ch === "" ) { 
            this.done = true;
        }
        
        while( this.done === false ) {
            switch( state ) { 
            case 0:
                from = this.pos;

                // start state 
                if( ch === ';' ) { 
                    result = makeToken( "(nl)", ch, this.line, from, this.pos );
                }
                else if( ch === '\n' ) {
                    if( continuation ) {
                        continuation = false;
                        // skip newline.
                        token = "";
                    }
                    else {
                        result = makeToken( "(nl)", ch, this.line, from, this.pos );
                    }
                }                
                else if( ch === '\\' ) { 
                    continuation = true;
                }     
                else if( ch === "/" && ch1 === "/" ) { 
                    state = LINE_COMMENT;
                }
                else if( ch === "/" && ch1 === "*" ) { 
                    eat = true;
                    state = BLOCK_COMMENT;
                    addCommentNewline = false;
                    nlInComment = false;
                }
                else if( ch === "'" ) { 
                    state = SINGLE_STR;
                }
                else if( ch === '"' ) { 
                    state = DOUBLE_STR;
                }
                else if( ch === '.' && ch1 === '.' ) { 
                    state = ELLIPSIS;
                    token = ".";
                }
                else if( /[_A-Za-z]/.test( ch ) && !/[_A-Za-z0-9]/.test( ch1 ) )  { 
                    result = makeToken( "name", ch, this.line, from, this.pos );
                }
                else if( /[_A-Za-z]/.test( ch ) ) { 
                    state = VARIABLE;
                    token = ch;
                }
                else if( ch === "." && /[0-9]/.test( ch1 ) ) { 
                    state = NUMBER_DECIMAL;
                    token = ch;
                }
                else if( /[0-9]/.test( ch ) && ch1 === "." ) { 
                    state = NUMBER_NO_DECIMAL;
                    token = ch;
                }
                else if( /[0-9]/.test( ch ) && !/[0-9]/.test( ch1 ) ) { 
                    result = makeToken( "number", ch, this.line, from, this.pos );
                }
                else if( /[0-9]/.test( ch ) ) { 
                    state = NUMBER_NO_DECIMAL;
                    token = ch;
                }
                else if( ch === "$" && ch1 === "$" ) { 
                    result = makeToken( "operator", "$$", this.line, from, this.pos );
                    eat = true;
                }
                else if( ch === "$" ) { 
                    result = makeToken( "operator", "$", this.line, from, this.pos );
                }
                else if( ( "+-<>=!".indexOf( ch ) != -1 && ch1 === "=" ) ||
                   ( ch === "<" && ch1 === ">" ) || 
                   ( ch === "|" && ch1 === "|" ) ||
                   ( ch === "&" && ch1 === "&" ) ||
                   ( ch === "&" && ch1 === "&" ) ||
                   ( ch === "^" && ch1 === "^" ) ) {
                    result = makeToken( "operator", ch + ch1, this.line, from, this.pos );
                    eat = true;
                }
                else if( "{}/*,.()[]?:<>!=+-^|&".indexOf( ch ) != -1 ) { 
                    result = makeToken( "operator", ch, this.line, from, this.pos );
                }
                break;
            case 1: // LINE_COMMENT
                if( ch1 === '\n' ) {
                    if( !continuation ) { 
                        result = makeToken( '(nl)', "", this.line, from, this.pos );
                    }
                    
                    // ignore comments.
                    eat = true;                    
                    state = 0;
                    token = "";
                }
                else { 
                    token += ch;
                }
                break;
            case 2: // BLOCK COMMENT
                if( ch === '*' && ch1 === '/' ) { 

                    // ignore comments.
                    state = 0;
                    token = "";
                    
                    // We want block comments to add one newline token if it contains a newline.
                    // However, if it only contains one newline and it was preceded by a continuation token,
                    // don't add the newline.
                    if( ( continuation === false && nlInComment ) || addCommentNewline ) {
                        result = makeToken( '(nl)', "", this.line, this.pos, this.pos );                    
                    }
                    
                    eat = true;
                }
                else { 
                    if( ch === '\n' ) {
                        // If this is >= second newline, and we're preceded by a continuation, add a newline.
                        addCommentNewline = continuation && nlInComment;
                        nlInComment = true;
                    }
                    token += ch;
                }
                break;
            case 3: // SINGLE_STR 
                if( ch === "'" && ch1 === "'" ) {   
                    token += "'";
                    eat = true;
                }
                else if( ch === "'" ) { 
                    result = makeToken( 'string', token, this.line, from, this.pos );
                }
                else { 
                    token += ch;
                }
                break;                
            case 4: // DOUBLE_STR -- first ch will not be '"'
                if( ch === '"' && ch1 === '"' ) {   
                    token += '"';
                    eat = true;
                }
                else if( ch === '"' ) { 
                    result = makeToken( 'string', token, this.line, from, this.pos );
                }
                else { 
                    token += ch;
                }
                break;                
            case 5: // VARIABLE
                token += ch;
                
                if( !/[_A-Za-z0-9]/.test( ch1 ) ) { 
                    result = makeToken( 'name', token, this.line, from, this.pos );
                }
                break;
            case 6: // NUMBER_NO_DECIMAL
                if( ch === '.' && /[0-9]/.test( ch1 ) ) { 
                    token += '.';
                    state = NUMBER_DECIMAL;
                }
                else if( ch === '.' ) { 
                    result = makeToken( 'number', token, this.line, from, this.pos );
                }
                else if( !/[0-9]/.test( ch1 ) ) {
                    result = makeToken( 'number', token + ch, this.line, from, this.pos );
                }
                else {
                    token += ch;
                }                    
                break;
            case 7: // NUMBER_DECIMAL 
                if( !/[0-9]/.test( ch1 ) ) {
                    result = makeToken( 'number', token + ch, this.line, from, this.pos );
                }
                else {
                    token += ch;
                }                    
                break;                
            case 8: // ELLIPSIS
                token += ch;
                
                if( ch1 != '.' ) { 
                    if( token != '...' ) { 
                        throw "invalid token " + token;
                    }
                    result = makeToken( 'operator', token, this.line, from, this.pos );
                }
                
                break;
            default:
                // skip these characters.
            }
           
            if( eof ) {
                this.pos++;
                break;
            }
            
            this.line_pos++;
            
            // keep track of lines.
            if( ch === '\n' ) { 
                this.line++; 
                this.line_pos = 0; 
            }

            if( eat ) { 
                this.line_pos += 1;
                
                // consume the whole lookahead and keep track of lines.
                if( ch1 === '\n' ) { 
                    this.line++; 
                    this.line_pos = 0; 
                }
                
                this.pos += 2;
                ch = this.code.charAt( this.pos );
            }
            else {
                this.pos++;
                ch = ch1;
            }
            
            if( result ) {             
                // if we have a result now, just exit.
                break;
            }
            
            // update lookahead.
            ch1 = this.code.charAt( this.pos + 1 );

            // check for eof conditions.
            if( ch === "" ) { 
                // we must have consumed the lookahead and ran into the eof.
                break;
            }
            else if( ch1 === "" ) { 
                // lookahead is eof -- process one more character (set lookahead to newline).
                eof = true;
                ch1 = '\n';
            }
            eat = false;
        }
        
        if( ( !this.done && result === null ) ) {
            this.done = true;
        }
        
        return result;            
    },
        
    get: function() { 
        var rtn = null;
        if( this.curToken ) {
            rtn = this.curToken;
            this.curToken = null;
        }
        else { 
            rtn = this.readNextToken();
        }
        return rtn;
    },
    
    peek: function() { 
        if( !this.curToken ) {
            this.curToken = this.readNextToken();
        }
        return this.curToken;
    }
};

},{}],3:[function(require,module,exports){

// parse.js
// OScript parser based on Douglas Crockford's javascript parser.
// From Top Down Operator Precedence

var Lexer = require( './lexer' );

function flatten(arr) { 
    var numItems = arr.length, i = -1, rtn = [], rIndex = 0;
    while( ++i < numItems ) {
        var a = arr[i], j = -1, aLen = a.length;
        while( ++j < aLen ) {
            rtn[rIndex++] = a[j];
        }
    }
    return rtn;
}

function indexOf( array, value, fromIndex ) {
    var index = (fromIndex || 0) - 1,
        length = array ? array.length : 0;

    while (++index < length) {
      if (array[index] === value) {
        return index;
      }
    }
    return -1;
}

function unique(arr) {
    if( arr.unique ) {
        return arr.unique();
    }
    var i = -1, result = [], arrLen = arr.length, v;
    while( ++i < arrLen ) { 
        v = arr[i];
        if( indexOf( result, v ) < 0 ) {
            result.push( v );
        }
    }
    return result;
}

function union() { 
    return unique( flatten( arguments ) );
}

function make_parser( additionalTypes ) {
    "use strict";

    var builtinTypes = union( [ 
                        "Assoc", 
                        "Bytes", 
                        "CapiConnect", "CacheTree",
                        "Date", "Dynamic", "DAPINode", "DAPISession", "DAPIVersion", "DAPIStream", "DOMAttr",  "DOMCDATASection",  "DOMCharacterData",  "DOMComment", 
                            "DOMDocument",  "DOMDocumentFragment",  "DOMDocumentType", 
                            "DOMElement",  "DOMEntity",  "DOMEntityReference",  "DOMImplementation", 
                            "DOMNamedNodeMap",  "DOMNode",  "DOMNodeList",  "DOMNotation",  "DOMParser", 
                            "DOMProcessingInstruction",  "DOMText",
                        "Error",
                        "File", "FileCopy", "FilePrefs", "Frame",
                        "Integer",
                        "JavaObject",
                        "List", "Long",
                        "MailMessage",
                        "Object", "ObjRef",
                        "Pattern",  "PatFind",  "PatChange",
                        "Real", "RegEx", "Record", "RecArray",
                        "String",
                        "UAPISESSION",  "UAPIUSER",
                        "WAPISESSION",  "WAPIMAP","WAPIMAPTASK","WAPIWORK","WAPISUBWORK",  
                        "SAXParser",  "XSLProcessor" 
                        ], additionalTypes || [] ).map( function( f ) { return f.toLowerCase(); } );
    
    var scope;
    var symbol_table = {};
    var token;
    var tokens;
    var token_nr;

    var itself = function () {
        return this;
    };

    function skip_newlines() { 
        while( token.arity === "(nl)" ) {
            advance( "(nl)" );
        }
    }

    function eos() { 
        advance( "(nl)" );
        skip_newlines();
    }

    var original_scope = {
        define: function (n, undeclared) {
            var v = n.value.toLowerCase();
            var t = this.def[v];
            if (typeof t === "object") {
                // n.error(t.reserved ? "Already reserved." : "Already defined.");
                if( !t.undeclared ) { 
                    console.log( "Warning: %s is already %s", n.value, t.reserved ? "reserved" : "defined" );
                }
            }
            this.def[v] = n;
            n.reserved = false;
            n.nud      = itself;
            n.led      = null;
            n.std      = null;
            n.lbp      = 0;
            n.scope    = scope;
            
            if( undeclared ) { 
                // just for warnings.
                n.undeclared = true; 
            } 
            return n;
        },
        find: function (n) {
            // n is already lowercase...
            
            var e = this, o;
            while (true) {
                o = e.def[n];
                if (o && typeof o !== 'function') {
                    return e.def[n];
                }
                e = e.parent;
                if (!e) {
                    o = symbol_table[n];
                    return o && typeof o !== 'function' ? o : symbol_table["(name)"];
                }
            }
        },
        pop: function () {
            scope = this.parent;
        },
        reserve: function (n) {
            if (n.arity !== "name" || n.reserved) {
                return;
            }
            var v = n.value.toLowerCase();
            var t = this.def[v];
            if (t) {
                if (t.reserved) {
                    return;
                }
                if (t.arity === "name") {
                    n.error("Already defined.");
                }
            }
            this.def[v] = n;
            n.reserved = true;
        }
    };

    function new_scope() {
        var s = scope;
        scope = Object.create(original_scope);
        scope.def = {};
        scope.parent = s;
        return scope;
    }
    
    function reverse() { 
        token_nr -= 2;
        advance();
    }

    function advance( id ) {
        var a, o, t, v;
        
        if (id && token.id !== id) {
            token.error("Expected '" + id + "'.");
        }
        
        if (token_nr >= tokens.length) {
            token = symbol_table["(end)"];
            return;
        }
        
        t = tokens[token_nr];
        token_nr++;
        
        v = t.value;
        a = t.type;
        var vl = v.toLowerCase();
        
        if (a === "name") {
            if( indexOf( builtinTypes, vl ) !== -1 ) { 
                o = symbol_table[vl];
                a = "name";
            }
            else { 
                o = scope.find(vl);
            }
        }
        else if (a === "operator") {
            o = symbol_table[vl];
            if (!o) {
                t.error("Unknown operator.");
            }
        }
        else if (a === "string" || a ===  "number") {
            o = symbol_table["(literal)"];
            a = "literal";
        } 
        else if( a === "(nl)" ) {
            o = symbol_table[a];
        }
        else {
            t.error("Unexpected token.");
        }
        
        // create an object from the type defined in the symbol table.
        token = Object.create(o);
        token.line  = t.line;
        token.from  = t.from;
        token.to    = t.to;
        token.value = v;
        token.arity = a;
        
        return token;
    }

    var expression = function (rbp) {
        var left;
        var t = token;
        advance();
        left = t.nud();
        while (rbp < token.lbp) {
            t = token;
            advance();
            left = t.led(left);
        }
        return left;
    };

    var statement = function () {
        var n = token, v;

        if (n.std) {
            advance();
            return n.std();
        }

        v = expression(0);
        eos();
        
        return v;
    };

    var statements = function () {
        var a = [], s;
        while (true) {
            if (token.id === "end" || token.id === "(end)" || token.id === 'else' || token.id === 'elseif' || token.id === 'until' ) {
                break;
            }
            s = statement();
            if (s) {
                a.push(s);
            }
        }
        return a.length === 0 ? null : a.length === 1 ? a[0] : a;
    };

    var original_symbol = {
        nud: function () {
            if( this.arity === 'name' ) {
                console.warn( "%s was not defined", this.value );
                return this;
            }

            this.error("Error parsing this statement.");
        },
        led: function (left) {
            this.error("Missing operator.");
        }
    };

    var symbol = function (id, bp) {
        var s = symbol_table[id];
        bp = bp || 0;
        if (s) {
            if (bp >= s.lbp) {
                s.lbp = bp;
            }
        } else {
            s = Object.create(original_symbol);
            s.id = s.value = id;
            s.lbp = bp;
            symbol_table[id] = s;
        }
        return s;
    };

    var constant = function (s, v) {
        var x = symbol(s);
        x.nud = function () {
            scope.reserve(this);
            this.value = symbol_table[this.id].value;
            this.arity = "literal";
            return this;
        };
        x.value = v;
        return x;
    };

    var infix = function (id, bp, led) {
        var s = symbol(id, bp);
        s.led = led || function (left) {
            this.first = left;
            this.second = expression(bp);
            this.arity = "binary";
            return this;
        };
        return s;
    };

    var infixr = function (id, bp, led) {
        var s = symbol(id, bp);
        s.led = led || function (left) {
            this.first = left;
            this.second = expression(bp - 1);
            this.arity = "binary";
            return this;
        };
        return s;
    };

    var assignment = function (id) {
        return infixr(id, 10, function (left) {
            if (left.id !== "." && left.id !== "[" && left.id !== '$' && left.id !== '$$' && left.arity !== "name" ) {
                left.error("Bad lvalue.");
            }
            this.first = left;
            this.second = expression(9);
            this.assignment = true;
            this.arity = "binary";
            return this;
        });
    };

    var prefix = function (id, nud) {
        var s = symbol(id);
        s.nud = nud || function () {
            scope.reserve(this);
            this.first = expression(70);
            this.arity = "unary";
            return this;
        };
        return s;
    };

    var prefixist = function (id, nud) {
        var s = symbol(id);
        s.nud = nud || function () {
            scope.reserve(this);
            this.first = expression(90);
            this.arity = "unary";
            return this;
        };
        return s;
    };
    
    var prefix_infix = function( id, bp, nudled ) {
        var s = symbol( id, bp );
        s.nud = nudled;
        s.led = nudled;
        return s;
    };

    var stmt = function (s, f) {
        var x = symbol(s);
        x.std = f;
        return x;
    };

    symbol("(nl)" );
    symbol( "end" );
    symbol("(end)");
    symbol("(name)");
    symbol(":");
    symbol(";");
    symbol(")");
    symbol("]");
    symbol("}");
    symbol(",");
    symbol( "else" );
    symbol( "until" );
    symbol( "case" );
    symbol( "default" );
    symbol( "to" );
    symbol( "downto" );

    constant( "true", true );
    constant( "false", false );
    constant( "undefined", null );

    symbol("(literal)").nud = itself;

    symbol("this").nud = function () {
        scope.reserve(this);
        this.arity = "this";
        return this;
    };

    assignment("=");
    assignment("+=");
    assignment("-=");

    infix("?", 20, function (left) {
        this.first = left;
        this.second = expression(0);
        advance(":");
        this.third = expression(0);
        this.arity = "ternary";
        return this;
    });

    infixr("&", 15);
    infixr("|", 15);
    infixr("^", 15);

    infixr("and", 30);
    infixr("or", 30);
    infixr("&&", 30);
    infixr("||", 30);
    infixr("^^", 30);

    infixr("==", 40);
    infixr("!=", 40);
    infixr("<>", 40);
    infixr("<", 40);
    infixr("<=", 40);
    infixr(">", 40);
    infixr(">=", 40);

    infix("+", 50);
    infix("-", 50);

    infix("*", 60);
    infix("/", 60);

    prefix_infix( ".", 80, function (left) {
        // infix version.
        this.first = left;
        if (token.id == '(' ) {
            advance( '(' );
            this.second = expression( 10 );
            advance( ')' );
        }
        else { 
            token.arity = "literal";
            this.second = token;
            advance();
        }   

        this.arity = "binary";
        return this;
    } );

    infix("[", 80, function (left) {
        this.first = left;
        this.second = expression(0);
        this.arity = "binary";
        advance("]");
        return this;
    });

    infix("(", 80, function (left) {
        var a = [];
        if (left.id === "." || left.id === "[") {
            // function call on member or index
            this.arity = "binary";
            this.first = left;
            this.second = a;
        } 
        else {
            this.arity = "binary";
            this.first = left;
            this.second = a;
            if ((left.arity !== "unary" || left.id !== "function") &&
                    left.arity !== "name" && left.id !== "(" &&
                    left.id !== "&&" && left.id !== "||" && left.id !== "?" && left.id !== '$' && left.id !== '$$' ) {
                left.error("Expected a variable name.");
            }
        }
        if (token.id !== ")") {
            while (true) {
                a.push(expression(0));
                if (token.id !== ",") {
                    break;
                }
                advance(",");
            }
        }
        advance(")");
        return this;
    });

    prefixist("$$");
    prefixist("$");

    prefix("!");
    prefix("-");

    prefix("(", function () {
        var e = expression(0);
        advance(")");
        return e;
    });

    prefix("function", function () {
        var a = [];
        var tmpRtnType, nameToken;
        
        new_scope();
        
        // this token can be the return type or the function name...
        
        if ( token.arity === "name") {
            // either return type or name of function
            tmpRtnType = token;
            advance();
        }
        else {
            throw "Expected name of function or return type";
        }
        
        if ( token.arity === "name" ) {
            // This is the function name.
            this.name = token.value;
            this.returnType = tmpRtnType;
            nameToken = token;
            advance();
        }
        else { 
            // no name for function -- assume dynamic return type and the 'return type' token becomes the function name.
            this.name = tmpRtnType.value;
            nameToken = tmpRtnType;
        }
        
        scope.define( nameToken );
        
        // arguments...
        advance("(");
        if (token.id !== ")") {
            while (true) {
                if( token.arity === 'operator' && token.value === '...' ) { 
                    // this must be the last argument.
                    a.push(token);
                    advance();
                    break;
                }
                else if ( token.arity !== "name") {
                    token.error("Expected a parameter definition.");
                }
                
                var varName, varType, t; 
                
                varType = token;
                advance();
                
                if( token.arity === 'name' ) { 
                    // variable name was supplied.
                    varName = token;
                    varName.dataType = varType;
                    advance();
                }
                else {
                    // the varType was actually the name.
                    varName = varType;
                    // varName.dataType = "dynamic";
                }
 
                scope.define(varName);
                
                if (token.id === "=") {
                    t = token;
                    advance("=");
                    t.first = varName;
                    t.second = expression(0);
                    t.arity = "binary";
                }
                else {
                    t = varName;
                }

                a.push(t);
                
                if (token.id !== ",") {
                    break;
                }
                advance(",");
            }
        }
        this.first = a;
        advance(")");
        eos();
        this.second = statements();
        advance("end");
        this.arity = "function";
        scope.pop();
        return this;
    });

    // List literals

    prefix("{", function () {
        var a = [];
        if (token.id !== "}") {
            while (true) {
                a.push(expression(0));
                if (token.id !== ",") {
                    break;
                }
                advance(",");
            }
        }
        advance("}");
        this.first = a;
        this.arity = "unary";
        return this;
    });

    // declarations...
    
    builtinTypes.forEach( function( varType ) { 
        stmt( varType, function () {
            var a = [], n, t;
            
            if( token.id === "." ) { 
                // this is not a declaration but a reference to a static member of a built-in type.
                // step back a token and evaluate as an expression statement...
                reverse();
                a = expression(0);
                eos();
                return a;
            }

            while (true) {
                n = token;
                if (n.arity !== "name") {
                    n.error("Expected a new variable name.");
                }
                scope.define(n);
                advance();
                if (token.id === "=") {
                    t = token;
                    advance("=");
                    t.first = n;
                    t.second = expression(0);
                    t.arity = "binary";
                }
                else {
                    t = n;
                    t.dataType = this;
                }
                a.push( t );
                
                if (token.id !== ",") {
                    break;
                }
                advance(",");
            }
            
            eos();
            return a.length === 0 ? null : a.length === 1 ? a[0] : a;
        });
    } );
    
    stmt("elseif", function() {
        this.first = expression(0);
        eos();
        
        this.second = statements();
        skip_newlines();
      
        if ( token.id === "elseif" ) {
            scope.reserve(token);
            this.third = statement();
            
            // final 'end' will be taken care of by elseif.
            this.arity = "statement";
            return this;
        }
        else if (token.id === "else") {
            scope.reserve(token);
            advance("else");
            eos();
            this.third = statements();
        } 
        else {
            this.third = null;
        }
        
        advance( "end" );
        eos();
        
        this.arity = "statement";
        return this;
    });

    stmt("if", function() {
        this.first = expression(0);
        eos();
        
        this.second = statements();
        skip_newlines();
      
        if ( token.id === "elseif" ) {
            scope.reserve(token);
            this.third = statement();

            // final 'end' will be taken care of by elseif.
            this.arity = "statement";
            return this;
        }
        else if (token.id === "else") {
            scope.reserve(token);
            advance("else");
            eos();
            this.third = statements();
        } 
        else {
            this.third = null;
        }
        
        advance( "end" );
        eos();
        
        this.arity = "statement";
        return this;
    });

    stmt("return", function () {
        if( token.id !== "(nl)" ) {
            this.first = expression(0);
        } 
        eos();
        
        if ( token.id !== "end" && token.id !== '(end)' ) {
            token.error("Unreachable statement.");
        }
        this.arity = "statement";
        return this;
    });

    stmt("break", function () {
        eos();
        
        if ( token.id !== "end" && token.id !== '(end)' ) {
            token.error("Unreachable statement.");
        }
        this.arity = "statement";
        return this;
    });

    stmt("breakif", function () {
        this.first = expression( 0 );
        eos();
        
        this.arity = "statement";
        return this;
    });

    stmt("continue", function () {
        eos();
        
        if ( token.id !== "end" && token.id !== '(end)' ) {
            token.error("Unreachable statement.");
        }

        this.arity = "statement";
        return this;
    });

    stmt("continueif", function () {
        this.first = expression( 0 );
        eos();
        
        this.arity = "statement";
        return this;
    });

    stmt("while", function () {
        
        this.first = expression(0);
        eos();
        
        this.second = statements();
        advance("end");eos();
        
        this.arity = "statement";
        
        return this;
    });

    stmt("repeat", function () {
        eos();

        this.first = statements();
        
        advance("until");
        
        this.second = expression(0);
        eos();
        
        this.arity = "statement";
        return this;
    });    

    stmt("switch", function() {
        this.first = expression(0);
        eos();

        var c, e, s;        
        this.second = [];
        
        while( true ) { 
            if( token.id === "case" ) {
                c = token;
                c.first = [];
                advance( "case" );

                // match 1 or more case values separated by commas.
                while( true ) { 
                    e = expression(0);
                    c.first.push( e );
                    if( token.id !== "," ) {
                        break;
                    }
                    advance( "," );
                }
                eos();
            }
            else if( token.id === "default" ){ 
                c = token; 
                c.first = "default";
                advance( "default" );
                eos();
            }
            else break;

            c.second = statements();
            c.arity = "binary";
            this.second.push( c );
            
            // end of case or default
            advance( "end" );
            eos();
        }
            
        // end of switch
        advance( "end" );
        eos();

        this.arity = "switch";
        return this;
    });
    
    
    return { 
        parse: function parse( source ) {   
    
            // reset state
            scope = null;
            token = null;
            tokens = [];
            token_nr = 0;
            
            // Init the lexer and read all the tokens into our token buffer.
            var lex = new Lexer(),
                t;
            lex.setInput( source );
            
            while( ( t = lex.get() ) !== null ) { 
                tokens.push( t );
            }
            
            // add one ending newline.
            tokens.push( { type: "(nl)", value: "" } );
            
            // init and parse.
            new_scope();
            advance();
            
            // eat any beginning whitespace...
            skip_newlines();
            
            var s = statements();
            advance("(end)");
            scope.pop();
            return s;
        }
    };
}

module.exports = make_parser;


},{"./lexer":2}]},{},[1,2,3]);
