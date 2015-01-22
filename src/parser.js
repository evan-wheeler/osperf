
// parse.js
// OScript parser based on Douglas Crockford's javascript parser.
// From Top Down Operator Precedence

var Lexer = require( './lexer' ),
    util = require( './util' ),
    preprocessor = require( './preprocessor' );
    
function make_parser( options ) {
    "use strict";
    
    options = options || { unreachable_code_errors: false };

    var builtinTypes = util.union( [ 
                        "Assoc", 
                        "Bytes", "Boolean",
                        "CapiConnect", "CacheTree", "CAPILOGIN", "CAPILog", "CAPIErr",
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
                        "String", "Script", "Socket",
                        "UAPISESSION",  "UAPIUSER", "ULong",
                        "WAPISESSION",  "WAPIMAP","WAPIMAPTASK","WAPIWORK","WAPISUBWORK",  
                        "SAXParser",  "XSLProcessor" 
                        ], options.additionalTypes || [] ).map( function( f ) { return f.toLowerCase(); } );
    
    var reservedWords = [ "and", "or", "not", "eq", "lt", "gt",
                            "if", "elseif", "for", "switch", "repeat", "while", "end", "function", 
                            "in", "to", "downto", "default", "case", "return", "break", "breakif", "continueif", "continue" ];
                            
    var opAlternates = {
        'eq': '=',
        'lt': '<',
        'gt': '>',
        'or': '||',
        'and': '&&',
        'not': '!'
    };
                            
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

    var token_error = function ( t, message ) {
        t.type = "SyntaxError";
        t.message = message;
        throw t;
    };    
    
    var original_scope = {
        define: function ( n ) {
            var v = n.value.toLowerCase();
            var t = this.def[v];
            
            /*if (typeof t === "object" && t.reserved ) {
                // token_error( n, n.value + " not expected here. The id is already defined" );                
            }
            */
            
            if( util.indexOf( reservedWords, v ) > -1 ) {
                token_error( n, n.value + ' not expected here.' );
            }
            
            this.def[v] = n;
            n.reserved = false;
            n.nud      = itself;
            n.led      = null;
            n.std      = null;
            n.lbp      = 0;
            n.scope    = scope;
            
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
                    token_error(n, "Already defined.");
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
            token_error( token, "Expected '" + id + "'.");
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
        
        var alt = opAlternates[vl];
        
        // check for operator alternates...
        if( a === "name" && alt ) { 
            a = 'operator';
            vl = alt;
        }
        
        switch( a ) { 
        case "name":
            if( util.indexOf( builtinTypes, vl ) !== -1 ) { 
                o = scope.find(vl);
                
                if( o === symbol_table["(name)"] ) { 
                    o = symbol_table[vl];
                    a = "name";
                }
            }
            else { 
                o = scope.find(vl);
            }
            break;
        case "operator":
            o = symbol_table[vl];
            if (!o) {
                token_error( t, "Unknown operator.");
            }
            break;
        case "string": case "number": case "objref":
            o = symbol_table["(literal)"];
            a = "literal";
            break;
        case "(nl)":
            o = symbol_table[a];
            break;
        default:
            token_error( t, "Unexpected token.");
        }
        
        // create an object from the type defined in the symbol table.
        token = Object.create(o);
        token.line  = t.line;
        token.from  = t.from;
        token.to    = t.to;
        token.colFrom = t.colFrom;
        token.colTo = t.colTo;
        token.value = v;
        token.arity = a;
                
        return token;
    }

    var expression = function (rbp) {
        var left;
        var t = token;
        
        // We shouldn't find statement reserved words here...
        if( t.std && t.reservedWord ) {
            // This statement token shouldn't be here.
            token_error( t, t.value + " not expected here." );
        }
        
        advance();
        left = t.nud();
        while (rbp < token.lbp ) {
            t = token;
            advance();
            left = t.led(left);
        }
        return left;
    };

    var statement = function () {
        var n = token, v;
        
        // try to match labels...
        if( n.arity === 'name' ) { 
            advance();
            
            if( token.id === ':' ) { 
                advance( ":" );
                scope.define( n );  // this also prevents reserved words from being labels.
                n.label = true;
                skip_newlines();
                return n;
            }
            
            if( util.indexOf( builtinTypes, n.value.toLowerCase() ) > -1 ) { 
                // if the next character is a name, this is probably a declaration.
                if( token.arity === "name" ) { 
                    return declaration( n );
                }
                else if( token.id === '(nl)' ) { 
                    // a variable type is allowed to be alone on a line --- essentially a noop.
                    eos();
                    return [];
                }
            }
            
            // reverse and parse as a statement or an expression.
            reverse();
        }
        
        if (n.std) {
            advance();
            return n.std();
        }

        // try expression-statement
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
                // console.warn( "%s was not defined", this.value );
                return this;
            }

            token_error( this, "Error parsing this statement.");
        },
        led: function (left) {
            token_error( this,"Missing operator.");
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
                token_error( left,"Bad lvalue.");
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
    
    var prefix_infix = function( id, bp, nud, led ) {
        var s = symbol( id, bp );
        s.nud = nud;
        s.led = led || nud;
        return s;
    };
        
    var stmt = function (s, f) {
        var x = symbol(s);
        x.nud = function () {
            scope.reserve(this);
            this.first = expression(70);
            this.arity = "unary";
            return this;
        };
        x.std = f;
        return x;
    };

    symbol("(nl)" );
    symbol( "end" );
    symbol("(end)");
    symbol("(name)");
    symbol("...");
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

    assignment("*=");
    assignment("/=");
    assignment("%=");

    assignment("&=");
    assignment("|=");
    assignment("^=");

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

    infixr( "<<", 45 );
    infixr( ">>", 45 );    
    
    infix( "in", 50 );
    
    infix("+", 50);
    infix("-", 50);

    infix("*", 60);
    infix("/", 60);
    infix("%", 60);

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

    prefix_infix( "[", 80, function () {
            var name = "";
            
            while( token.id === '.' || token.arity === 'name' ) { 
                name += token.value;
                advance();
            }
                  
            advance("]");
            
            this.first = name;
            this.id = "xlate";
            this.arity = "unary";
            return this;
        }, 
        function (left) {
            var range;
            this.first = left;

            if( token.id === ':' ) { 
                range = token;
                range.id = ":";
                range.arity = "binary";
                
                advance( ":" );

                this.second = range;
                
                if( token.id !== "]" ) { 
                    range.second = expression( 0 );
                }
            }
            else {
                var e = expression(0);
                
                if( token.id === ":" ) { 
                    range = token;
                    range.id = ":";
                    range.arity = "binary";
                    
                    advance( ":" );
                    
                    range.first = e;
                    this.second = range;
                    
                    if( token.id !== "]" ) { 
                        range.second = expression( 0 );
                    }
                }
                else {
                    this.second = e;
                }
            }

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
                token_error( left,"Expected a variable name.");
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

    prefix("not", function () {
            this.first = expression(70);
            this.arity = "unary";
            this.id = "!";
            return this;
    } );
    
    prefix("!");
    prefix("-");
    
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

    stmt( "goto", function() { 
        if( token.arity === "name" ) { 
            this.first = token;
        }
        else { 
            token_error( token, "Expected label" );
        }
        this.arity = "unary";
        return this;
    } );
    
    prefix("(", function () {
        var e = expression(0);
        advance(")");
        return e;
    });

    stmt( "function", function () {
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
        
        // Don't define the function name -- OScript allows defining functions with names of types.
        // scope.define( nameToken );
        
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
                    token_error( token,"Expected a parameter definition.");
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

        // keep a reference to the first token (end of statement character)
        this.start = token;

        eos();

        this.second = statements();

        // keep a reference to the last token
        this.end = token;
        
        advance("end");

        this.arity = "function";
        scope.pop();
        eos();
        
        return this;
    });

    function declaration( varType ) { 
        var a = [], n, t;
        
        while (true) {
            n = token;
            if (n.arity !== "name") {
                token_error( n,"Expected a new variable name.");
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
            }
            t.dataType = varType;
            a.push( t );
            
            if (token.id !== ",") {
                break;
            }
            advance(",");
        }
        
        eos();
        return a.length === 0 ? null : a.length === 1 ? a[0] : a;                
    }
    
    builtinTypes.forEach( function( varType ) { 
        symbol( varType );
    } );

    var ifElseIf = function() {
        this.first = expression(0);
        eos();
        
        this.second = statements();
        skip_newlines();
      
        if ( token.id === "elseif" ) {
            this.third = statement();
            
            // final 'end' will be taken care of by original if.
            this.arity = "statement";
            return this;
        }
        else if (token.id === "else") {
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
    };
     
    stmt( "if", ifElseIf );
    stmt( "elseif", ifElseIf ); 

    stmt("return", function () {
        if( token.id !== "(nl)" ) {
            this.first = expression(0);
        } 
        this.eos = token;
        eos();
        
        if ( token.id !== "end" && token.id !== 'elseif' && token.id !== 'else' && token.id !== '(end)' ) {
            if( options.unreachable_code_errors ) { 
                token_error( token, "Unreachable statement.");
            }
        }
        this.arity = "statement";
        return this;
    });

    stmt("break", function () {
        eos();
        
        if ( token.id !== "end" && token.id !== '(end)' ) {
            if( options.unreachable_code_errors ) { 
                token_error( token,"Unreachable statement.");
            }
        }
        this.arity = "statement";
        return this;
    });

    stmt("breakif", function () {
        this.first = expression( 0 );
        this.eos = token;
        eos();
        
        this.arity = "statement";
        return this;
    });

    stmt("continue", function () {
        eos();
        
        if ( token.id !== "end" && token.id !== '(end)' ) {
            token_error( token,"Unreachable statement.");
        }

        this.arity = "statement";
        return this;
    });

    stmt("continueif", function () {
        this.first = expression( 0 );
        this.eos = token;
        eos();
        
        this.arity = "statement";
        return this;
    });

    stmt("while", function () {
        
        this.first = expression(0);
        this.eos = token;
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
    
    stmt( "for", function() { 
        var lookBodyName = "third";
        
        if( token.id === '(' ) { 
            advance( '(' );

            // c-style for loop.
            this.first = ( token.id !== '(nl)' ) ? expression(0) : null;
            advance( '(nl)' );

            this.second = ( token.id !== '(nl)' ) ? expression(0) : null;
            advance( '(nl)' );

            this.third = ( token.id !== ')' ) ? expression(0) : null;
            advance( ')' );
            eos();

            this.fourth = statements();

            this.id = "for_c";
        }
        else if( token.arity === "name" ) { 
            // for "x in" or for "x = 1 ..."            
            
            this.first = token;
            advance();
            
            if( token.id === "=" ) { 
                advance( '=' );
                this.second = expression(0);
                
                if( token.id === 'to' || token.id === 'downto' ) {
                    this.direction = token;
                    advance();
                }
                
                this.third = expression(0);
                eos();
                
                this.fourth = statements();                
                this.id = "for";
            }
            else if( token.id === "in" ) { 
                reverse();
                this.first = expression( 0 );
                eos();
                
                this.second = statements();
                this.id = "for_in";
            }
            else {
                token_error( token, "Unexpected token.  Expected 'in' or '='." );
            }
        }
        else { 
            token_error( token, "Unexpected token. Expected '(' or a variable name." );
        }
        
        advance( "end" );
        eos();
        this.arity = "statement";
        return this;
    } );

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

    reservedWords.forEach( function(r) { 
        var t = symbol_table[r];
        if( typeof t === "object" ) { 
            t.reservedWord = true;
        }
    } );
    
    return { 
        getTokens: function() { 
            return tokens;
        },
        
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
            
            // send through preprocessor...
            tokens = preprocessor.run( tokens );
            
            // if the program doesn't end with some kind of end-of-statement character, add one.
            if( tokens.length > 0 ) { 
                var lastToken = tokens[tokens.length-1];
                if( lastToken.type !== '(nl)' ) { 
                    tokens.push( { 
                        type: '(nl)', 
                        value:'', 
                        from: lastToken.to+1, 
                        to:lastToken.to+1, 
                        line:lastToken.line, 
                        colFrom: lastToken.colTo+1,
                        colTo: lastToken.colTo+1 } );
                }
            }
                        
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

