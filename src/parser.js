
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
                        "Bytes", "Boolean",
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
                o = scope.find(vl);
                
                if( o === symbol_table["(name)"] ) { 
                    o = symbol_table[vl];
                    a = "name";
                }
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
        
        // try to match labels...
        if( n.arity === 'name' ) { 
            advance();
            
            if( token.id === ':' ) { 
                advance( ":" );
                scope.define( n );
                n.label = true;
                skip_newlines();
                return n;
            }
            // TODO: Add variable declarations here instead of as a type of statement... it will be a little more flexible.
            
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

    infix( "in", 50 );
    
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
            token.error( "Expected label" );
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
        eos();
        
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
        
        if ( token.id !== "end" && token.id !== 'elseif' && token.id !== 'else' && token.id !== '(end)' ) {
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

            this.arity = "for-cstyle";
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
                this.arity = "for";
            }
            else if( token.id === "in" ) { 
                reverse();
                this.first = expression( 0 );
                eos();
                
                this.second = statements();
                this.arity = "for_in";
            }
            else {
                token.error( "Unexpected token.  Expected 'in' or '='." );
            }
        }
        else { 
            token.error( "Unexpected token. Expected '(' or a variable name." );
        }
        
        advance( "end" );
        eos();
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

