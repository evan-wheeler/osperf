var compare = require( './../compare' ),
    EditList = require( './edits' ),
    _ = require( 'lodash'),
    Walker = require( '../../../Bannockburn').Walker;

    // Walker = require( './walker' );

function isInstrumented( firstStmt ) {
    return compare( firstStmt, {
        "type": "ExpressionStatement",
        "expression": { "type": "CallExpression", "arguments": [ { "id": "(literal)", }, { "id": "this", "value": "this" } ] }
    } );
}

var instrCode = {
    enter: _.template( "$_P.I('<%= funcID %>')\n" ),
    exit: _.template( "\n$_P.O('<%= funcID %>')" ),
    rtn1: _.template( "$_P.O('<%= funcID %>')\n" ),
    rtn2: _.template( "Dynamic __r<%= retID %> = <%= arg %>;$_P.O('<%= funcID %>');return __r<%= retID %>" )
};

function isSimpleOp( node ) { 
    if ( !node ) {
        return true;
    }
    var arg = node[0];

    if( arg.id === "(name)" || arg.id === "(literal)" || arg.arity === 'literal' ) {
        return true;
    }
    else if( arg.type === "MemberExpression" ) {
        return ( !arg.object || arg.object.id === "(name)" || arg.object.id === "(literal)" || arg.object.arity === "literal" ) &&
                ( arg.property && ( arg.property.id === "(name)" || arg.property.id === "(literal)" || arg.property.arity === "literal" ) );
    }
    return false;
}

function instrument( code, parseTree, idGenerator ) {
    // walk the parse tree and add code at the beginning of each function definition, before 
    // each return function, and at the end of each function body.
    
    // walk the top level looking for functions...
    var editList = new EditList( code),
        funcID;

    var walker = new Walker();

    walker.on( {
        'before:FunctionDeclaration.body': function( func, body ) {
            if( isInstrumented( body[0] ) ) {
                // cancel.
                return false;
            }

            funcID = idGenerator( func.name );

            editList.insert( {
                str: instrCode.enter( { funcID: funcID } ),
                pos: this.getStartPos( body[0] ),
                indent: "after"
            } );
            return true;
        },
        'after:FunctionDeclaration.body': function( func, body ) {
            var lastStmt = body[body.length - 1];
            if( lastStmt.type !== 'ReturnStatement' ) {
                editList.insert( {
                    str: instrCode.exit( { funcID: funcID } ),
                    pos: this.getEndPos( lastStmt )+1,
                    indent: "before"
                } );
            }
        },
        'ReturnStatement': function( rtnStmt ) {
            var arg = rtnStmt.argument;

            if( isSimpleOp( arg ) ) {
                editList.insert( {
                    str: instrCode.rtn1( {funcID: funcID } ),
                    pos: this.getStartPos( rtnStmt ),
                    indent: "after"
                } );
            }
            else {
                var expr = code.substring( this.getStartPos( arg[0] ), this.getEndPos( arg[0] )+1 ),
                    start = this.getStartPos( rtnStmt ),
                    end = this.getEndPos( rtnStmt );

                var replaceWith = instrCode.rtn2( { arg: expr, funcID: funcID, retID: start } );
                editList.replace( start, end+1, replaceWith );
            }
        }
    }).start( parseTree );

    // return the instrumented code.
    return editList.apply();
}

module.exports = instrument;