
// parse.js
// OScript parser based on Douglas Crockford's javascript parser.
// From Top Down Operator Precedence

var Lexer = require( './lexer' ),
    util = require( './util' ),
    preprocessor = require( './preprocessor' ),
    clone = require( 'clone' );
    
function make_parser( options ) {
    "use strict";
    
    options = options || { unreachable_code_errors: false };

    var builtinTypes = util.union( [ 
                        "Assoc", 
                        "Bytes", "Boolean",
                        "CapiConnect", "CacheTree", "CAPILOGIN", "CAPILog", "CAPIErr",
                        "Dialog", "Date", "Dynamic", "DAPINode", "DAPISession", "DAPIVersion", "DAPIStream", "DOMAttr",  "DOMCDATASection",  "DOMCharacterData",  "DOMComment", 
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
    
    var whitespace = [];
    var lex = null;
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
        token.range = clone( t.range );
        token.loc = clone( t.loc );
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
        var n = token, v, eosTok;
        
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
                    eosTok = token;
                    eos();
                    
                    return { 
                        type: "ExpressionStatement",
                        range: [ n.range[0], eosTok.range[1] ],
                        expression: n,
                        eos: eosTok,
                        arity: "statement"
                    };
                }
            }
            
            // reverse and parse as a statement or an expression.
            reverse();
        }
        
        // if our token has a std function it is one of our statements.
        if (n.std) {
            advance();
            return n.std();
        }

        // anything else will be a statement expression
        return statementExpression();
    };
    
    var statementExpression = function( ) {
        var v = expression(0);
        
        var eosTok = token;
        eos();
        
        // if it's an expression statement, wrap it in an EpressionStatement.
        return { 
            type: "ExpressionStatement",
            range: [ v.range[0], eosTok.range[1] ],
            loc: [ v.loc.start, eosTok.loc.end ],
            expression: v,
            eos: eosTok,
            arity: "statement"
        };    
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
        
        if( a.length === 0 ) { 
            return null;
        }

        return a;
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
    
    var getLocStart = function( ref ) {
        if( ref && ref.loc ) {
            return ref.loc.start;
        }
        return null;
    };

    var getLocEnd = function( ref ) {
        if( ref && ref.loc ) {
            return ref.loc.end;
        }
        return null;
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
        
            this.left = left;
            this.right = expression(bp);
            this.arity = "binary";
            this.type = operatorType[id] || "BinaryExpression";
            
            this.range = [ this.left.range[0], this.right.range[1] ];
            this.loc = { start: getLocStart( this.left ), end: getLocEnd( this.right ) };
            
            return this;
        };
        return s;
    };

    var infixr = function (id, bp, led) {
        var s = symbol(id, bp);
        s.led = led || function (left) {
        
            this.left = left;
            this.right = expression(bp - 1);
            this.arity = "binary";
            this.type = operatorType[id] || "BinaryExpression";
            
            this.range = [ this.left.range[0], this.right.range[1] ];
            this.loc = { start:  getLocStart( this.left ), end: getLocEnd( this.right ) };

            return this;
        };
        return s;
    };

    var assignment = function (id) {
        return infixr(id, 10, function (left) {
            if (left.id !== "." && left.id !== "[" && left.id !== '$' && left.id !== '$$' && left.arity !== "name" ) {
                token_error( left,"Bad lvalue.");
            }
            this.left = left;
            this.right = expression(9);
            this.assignment = true;
            this.arity = "binary";

            this.type = "AssignmentExpression";
            this.operator = this.id;
            
            this.range = [ this.left.range[0], this.right.range[1] ];
            this.loc = { start:  getLocStart( this.left ), end: getLocEnd( this.right ) };
            
            return this;
        });
    };

    var prefix = function (id, nud) {
        var s = symbol(id);
        s.nud = nud || function () {
            scope.reserve(this);
            this.argument = expression(70);
            this.arity = "unary";
            this.type = operatorType[id] || "UnaryExpression";
            this.operator = this.id;
            this.prefix = true;
            this.range = [ this.range[0], this.argument.range[1] ];
            this.loc = { start:  getLocStart( this ), end: getLocEnd( this.argument ) };

            return this;
        };
        return s;
    };

    var prefixist = function (id, nud) {
        var s = symbol(id);
        s.nud = nud || function () {
            scope.reserve(this);
            this.argument = expression(90);
            this.arity = "unary";
            this.type = operatorType[id] || "UnaryExpression";
            this.operator = this.id;
            this.range = [ this.range[0], this.argument.range[1] ];
            this.loc = { start: getLocStart( this ), end: getLocEnd( this.argument ) };
            
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
        
        this.range = [ this.first.range[0], this.third.range[1] ];
        this.loc = { start:  getLocStart( this.first ), end: getLocEnd( this.third ) };
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

    var operatorType = {
        '||': 'LogicalExpression',
        '&&': 'LogicalExpression',
        '^^': 'LogicalExpression',
        '==': 'LogicalExpression'    
    };
    
    prefix_infix( ".", 80, function (left) {
        // infix version.
        this.object = left;
        if (token.id == '(' ) {
            advance( '(' );
            this.property = expression( 10 );
            this.computed = true;
            
            var end = token;
            advance( ')' );

            this.range = [ ( this.object || this ).range[0], end.range[1] ];
            this.loc = { start:  getLocStart( this.object || this ), end: getLocEnd( end ) };
        }
        else { 
            token.arity = "literal";
            this.property = token;
            this.computed = false;
            advance();

            this.range = [ ( this.object || this ).range[0], this.property.range[1] ];
            this.loc = { start:  getLocStart( this.object || this ), end: getLocEnd( this.property ) };
        }   
        
        this.type = "MemberExpression";
        this.arity = "binary";
        return this;
    } );

    prefix_infix( "[", 80, function () {
            var name = "", start = token;
            
            while( token.id === '.' || token.arity === 'name' ) { 
                name += token.value;
                advance();
            }
            
            var end = token;
            advance("]");
            
            this.first = name;
            this.id = "xlate";
            this.arity = "unary";
            this.type = "XLateExpression";
            this.range = [ start.range[0], end.range[1] ];
            this.loc = { start:  getLocStart( start ), end: getLocEnd( end ) };
            
            return this;
        }, 
        function (left) {
            
            // first should resolve to some object.
            this.object = left;

            var range = clone( this );

            if( token.id === ':' ) { 
                // range specifier with empty start index.

                this.fromIndex = null;
                this.toIndex = null;
                this.type = "RangeExpression";
                
                advance( ":" );
                
                if( token.id !== "]" ) { 
                    this.toIndex = expression( 0 );
                }
            }
            else {
                // range/index specifier.
                var e = expression(0);
                
                if( token.id === ":" ) { 
                    // range specifier
                    this.fromIndex = e;
                    this.toIndex = null;
                    this.type = "RangeExpression";
                    
                    advance( ":" );
                                        
                    if( token.id !== "]" ) { 
                        this.toIndex = expression( 0 );
                    }

                    this.type = "RangeExpression";                    
                }
                else {
                    // index specifier.
                    this.index = e;
                    this.type = "IndexExpression";
                }
            }

            this.arity = "binary";
            var end = token;
            advance("]");
            
            this.range = [ this.object.range[0], end.range[1] ];
            this.loc = { start:  getLocStart( this.object ), end: getLocEnd( end ) };

            return this;
    });

    infix("(", 80, function (left) {
        var a = [];
        if (left.id === "." || left.id === "[") {
            // function call on member or index
            this.arity = "binary";
            this.callee = left;
            this.arguments = a;
            this.type = "CallExpression";
        } 
        else {
            this.arity = "binary";
            this.callee = left;
            this.arguments = a;
            this.type = "CallExpression";
            
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
        
        var end = token;
        advance(")");
    
        this.range = [ this.callee.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this.callee ), end: getLocEnd( end ) };        
        
        return this;
    });
    
    prefixist("$$");
    prefixist("$");
    
    prefix("!");
    prefix("-");
    
    prefix( "#", function() { 
        // this is a special case where the following 
        // identifier should be treated as a literal
        // hex value.
        
        if( token.arity === "name" && /^[a-fA-F0-9]+$/.test( token.value ) ) { 
            this.arity = "literal";
            this.value = "#" + token.value;
            this.id = "(literal)";
            this.type = "ObjRefLiteral";
            
            this.range = [ this.range[0], token.range[1] ];
            this.loc = { start: getLocStart( this ), end: getLocEnd( token ) };        
            
            advance();
        }
        else { 
            token_error( token, "Expected hexadecimal value" );
        }
        
        return this;
    } );
    
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
        
        var end = token;
        advance("}");
        
        this.elements = a;
        this.arity = "unary";
        this.type = "ListExpression";
        this.range = [ this.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( end ) };        
        
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
    
    // pure grouping...
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
            tmpRtnType = token.value;
            advance();
        }
        else {
            throw "Expected name of function or return type";
        }
        
        if ( token.arity === "name" ) {
            // This is the function name.
            this.name = token.value;
            this.returnType = tmpRtnType.value;
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

                var param = {
                    "dataType": null,
                    "name": "", 
                    "default": null
                };
                
                if( token.arity === 'name' ) { 
                    // variable name/type was supplied.
                    varName = token;
                    param.dataType = varType.value;
                    advance();
                }
                else {
                    // the varType was actually the name.
                    varName = varType;
                }
 
                scope.define(varName);
                param.name = varName;
                
                if (token.id === "=") {
                    advance("=");
                    param["default"] = expression(0);
                }
                
                a.push(param);
                
                if (token.id !== ",") {
                    break;
                }
                advance(",");
            }
        }
        this.params = a;
        advance(")");

        eos();

        this.body = statements();

        // keep a reference to the last token
        var end = token;
        advance("end");

        this.arity = "function";
        scope.pop();

        this.eos = token;
        eos();
        
        this.range = [ this.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( end ) };        
        this.type = "FunctionDeclaration";
        
        return this;
    });

    function declaration( varType ) { 
        var a = [], n, t;
        
        var declarator = {
            type: "VariableDeclaration",
            declarations: a
        };
        
        while (true) {
            // n is name of variable.
            n = token;
            if (n.arity !== "name") {
                token_error( n,"Expected a new variable name.");
            }
            
            t = {
                type: "VariableDeclarator",
                name: n,
                init: null,
                dataType: varType
            };
            
            scope.define(n);
            advance();
            
            if (token.id === "=") {
                // declaration with assignment.
                advance("=");
                t.init = expression(0);
            }

            a.push( t );
            
            if (token.id !== ",") {
                break;
            }
            advance(",");
        }
        
        var eosToken = token;
        eos();
        
        declarator.range = [ varType.range[0], eosToken.range[0] ];
        declarator.loc = { start: getLocStart( varType ), end: getLocStart( eosToken ) };
        
        return declarator;          
    }
    
    builtinTypes.forEach( function( varType ) { 
        symbol( varType );
    } );

    var ifElseIf = function() {
        this.type = "IfStatement";
        
        this.test = expression(0);
        eos();
        
        this.consequent = statements();
        skip_newlines();
      
        if ( token.id === "elseif" ) {
            
            // The alternate will be an elseif statement.
            this.alternate = statement();
            
            this.arity = "statement";
            this.range = [ this.range[0], this.alternate.range[1] ];
            this.loc = { start: getLocStart( this ), end: getLocEnd( this.alternate ) };
            
            // final 'end' has already been matched by the elseif.
            return this;
        }
        else if (token.id === "else") {
            advance("else");
            eos();

            // the alternate is an array of zero or more statements.
            this.alternate = statements();
        } 
        
        var end = token;
        advance( "end" );
        this.eos = token;
        eos();
        
        this.range = [ this.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( end ) };
        
        this.arity = "statement";
        return this;
    };
     
    stmt( "if", ifElseIf );
    stmt( "elseif", ifElseIf ); 

    stmt("return", function () {
        if( token.id !== "(nl)" ) {
            this.argument = expression(0);
        } 
        
        eos();
        
        if ( token.id !== "end" && token.id !== 'elseif' && token.id !== 'else' && token.id !== '(end)' ) {
            if( options.unreachable_code_errors ) { 
                token_error( token, "Unreachable statement.");
            }
        }
        
        this.range = [ this.range[0], this.argument ? this.argument.range[1] : this.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( this.argument || this ) };
        this.type = "ReturnStatement";
        this.arity = "statement";
        return this;
    });

    stmt("break", function () {
        eos();

        if ( token.id !== "end" && token.id !== 'elseif' && token.id !== 'else' && token.id !== '(end)' ) {
            if( options.unreachable_code_errors ) { 
                token_error( token,"Unreachable statement.");
            }
        }
        this.arity = "statement";
        this.type = "BreakStatement";

        return this;
    });

    stmt("breakif", function () {
        this.first = expression( 0 );
        this.eos = token;
        eos();
        
        this.arity = "statement";
        this.range = [ this.range[0], this.first.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( this.first ) };
        this.type = "BreakIfStatement";

        return this;
    });

    stmt("continue", function () {
        eos();

        if ( token.id !== "end" && token.id !== 'elseif' && token.id !== 'else' && token.id !== '(end)' ) {
            if( options.unreachable_code_errors ) {
                token_error( token,"Unreachable statement.");
            }
        }

        this.arity = "statement";
        this.type = "ContinueStatement";
        return this;
    });

    stmt("continueif", function () {
        this.first = expression( 0 );
        this.eos = token;
        eos();
        
        this.arity = "statement";
        this.range = [ this.range[0], this.first.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( this.first ) };
        this.type = "ContinueIfStatement";

        return this;
    });

    stmt("while", function () {
        
        this.first = expression(0);
        eos();
        
        this.body = statements();

        var end = token;
        advance("end");
        
        this.eos = token;
        eos();
        
        this.arity = "statement";

        this.range = [ this.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( end ) };
        this.type = "WhileStatement";
        
        return this;
    });

    stmt("repeat", function () {
        eos();

        this.body = statements();
        
        advance("until");
        
        this.second = expression(0);
        
        this.eos = token;
        eos();
        
        this.arity = "statement";
        this.range = [ this.range[0], this.second.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( this.second ) };
        this.type = "RepeatStatement";

        return this;
    });
    
    stmt( "for", function() { 
    
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

            this.body = statements();

            this.id = "for_c";
            this.type = "ForCStyleStatement";            
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
                
                this.body = statements();                
                this.id = "for";
                this.type = "ForStatement";            
            }
            else if( token.id === "in" ) { 
                reverse();
                this.first = expression( 0 );
                eos();
                
                this.body = statements();
                this.id = "for_in";
                this.type = "ForInStatement";            
            }
            else {
                token_error( token, "Unexpected token.  Expected 'in' or '='." );
            }
        }
        else { 
            token_error( token, "Unexpected token. Expected '(' or a variable name." );
        }
        
        var end = token;
        advance( "end" );
        this.eos = token;
        eos();
        this.arity = "statement";

        this.range = [ this.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( end ) };

        return this;
    } );

    stmt("switch", function() {
        this.discriminant = expression(0);
        eos();

        var c, e, s, end;        
        this.cases = [];
        
        while( true ) { 
            if( token.id === "case" ) {
                c = token;
                c.test = [];
                advance( "case" );

                // match 1 or more case values separated by commas.
                while( true ) { 
                    e = expression(0);
                    c.test.push( e );
                    if( token.id !== "," ) {
                        break;
                    }
                    advance( "," );
                }
            }
            else if( token.id === "default" ){ 
                c = token; 
                c.test = null;
                advance( "default" );
            }
            else break;

            eos();

            c.consequent = statements();
            c.arity = "binary";
            
            // end of case or default
            end = token;
            advance( "end" );
            
            c.type = "SwitchCase";
            c.range = [ c.range[0], end.range[1] ];
            c.loc = { start: getLocStart( c ), end: getLocEnd( end ) };
            
            this.cases.push( c );
            
            eos();
        }
                
        // end of switch
        end = token;
        advance( "end" );

        this.eos = token;
        eos();

        this.arity = "statement";
        this.range = [ this.range[0], end.range[1] ];
        this.loc = { start: getLocStart( this ), end: getLocEnd( end ) };
        this.type = "SwitchStatement";

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
        
        getSource: function() { 
            return lex ? lex.getSource() : "";
        },
        
        parse: function parse( source ) {   
    
            // reset state
            scope = null;
            token = null;
            tokens = [];
            token_nr = 0;
            
            // Init the lexer and read all the tokens into our token buffer.
            lex = new Lexer( source );

            var t;
            
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

