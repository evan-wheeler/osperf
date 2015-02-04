var EditList = require( './edits' ),
    _ = require( 'lodash' );

/** 
 * Block class
 * Each block represents one or more lines of code (a range) that will 
 * have to execute if the beginning of the block is reached.
 */
function Block( blockType, id, startLine ) { 
    this.ranges = [ { start: startLine, end: startLine } ];
    
    this.id = id;
    this.type = blockType;
    this.reset = false;
}

/**
 * Increases the end marker for the current range.
 * If this block was previously interrupted by another block,
 * this will start a new range.
 * @param line  The line of code to add to the current range.
 */
Block.prototype.addLine = function( line ) { 
    if( this.interrupted ) { 
        if( line > this.ranges[ this.ranges.length - 1 ].end + 1 ) { 
            this.ranges.push( { start: line, end: line } );
        }    
        this.interrupted = false;
    }

    var last = this.ranges[ this.ranges.length - 1 ];
    last.end = Math.max( last.end, line );
};

/**
 * Interrupts the current range. 
 */
Block.prototype.interrupt = function() {
    this.interrupted = true;
};

Block.TYPES = {
    FUNCTION: 0,
    LOOP: 1,
    OTHER: 2
};


function defaultIDGenerator( functionName, blockIndex ) {
    return functionName + "[" + blockIndex + "]";
}

/**
 * Creates a BlockTracker, which is used to keeps track of the code coverage blocks
 * @class
 */
function BlockTracker( options ) {

    options = options || {};

    var curFunction = null,
        blockStack = [],
        blocks = [],
        blockIndex = 0,
        rawScript = false;

    var idGenerator = options.idGenerator || defaultIDGenerator,
        visitFn = options.visitFn,
        scope = options.scope || this;
    
    /** 
     * Sets the current function.
     * @param {string} name The name of the function
     */
    this.setFunction = function( name ) { 
        if( blockStack.length > 0 ) { 
            this.endBlock();
        }
        
        curFunction = name;
    };
    
    /**
     * Adds a line into the appropriate block, which is normally the block that 
     * is on the top of the stack.
     * 
     * @param {number} line - The line that should be included.
     * @param {number} insertPos - The character index where instrumentation should be inserted if needed.
     */
    this.addLine = function( line, insertPos ) { 
        if( blockStack.length === 0 ) {
            if( rawScript ) { 
                throw Error( "Extraneous input after last function is invalid." );
            }
            
            // We're outside of all functions.
            this.startBlock( Block.TYPES.FUNCTION, line, insertPos );
            rawScript = true;
        }
        
        var top = blockStack[blockStack.length - 1];
        
        if( top.reset ) { 
            this.endBlock();
            this.startBlock( top.type, line, insertPos );
        }
        else {
            top.addLine( line );
        }
    };

    /**
     * Starts a new block
     * @param {number} type - The block type.
     * @param {number} line - The line where the block begins.
     * @param {number} insertPos - The character index where instrumentation should be inserted.
     */
    this.startBlock = function( type, line, insertPos ) {
        if( arguments.length === 1 ) { 
            type = type.type;
            insertPos = type.insertPos;
            line = type.line;
        }
        
        if( line > -1 && insertPos > -1 ) { 
            var blockID = idGenerator.call( scope, curFunction, blockIndex++ ),
                block = new Block( type, blockID, line );
            
            if( blockStack.length > 0 ) { 
                blockStack[blockStack.length - 1].interrupt();
            }
            
            blockStack.push( block );
            blocks.push( block );

            // add the visit mark here.
            visitFn.call( options.scope, block, insertPos );
            // editList.insert( "$_C.v('" + blockID + "')\n", insertPos, "after" );

            return block;
        }
        throw Error( "Invalid startBlock argument(s): " + JSON.stringify( arguments ) );
    };
    
    /** 
     * Ends a block
     */
    this.endBlock = function() { 
        return blockStack.pop();
    };
    
    /** 
     * Traverses the stack, resetting blocks until a block of type blockType is found.
     * @param {integer} blockType - The type of block to find.
     */
    this.resetBlockType = function( blockType ) { 
        var i = blockStack.length;
        
        while( i-- ) { 
            var p = blockStack[i];            

            p.reset = true;
            
            if( p.type === blockType ) { 
                break;
            }
        }
    };
    
    /** 
     * Returns the blocks that were defined.
     */
    this.getBlocks = function() { 
        return blocks;
    };
}

function noop() { return true; }
function skipTraverse() { return false; }

var VISIT_TMPL = _.template( "__cov.('<%= id %>')+=1\n");

module.exports = function coverage( scriptID, src, parseNode, options ) {

    options = options || {};

    var editList = new EditList( src),
        functions = {};

    var ctx = new BlockTracker( {
        idGenerator: options.idGenerator || function( functionName, blockIndex ) {
            return scriptID + functionName + "[" + blockIndex + "]";
        },
        visitFn: function( block, insertPos ) {
            editList.insert( VISIT_TMPL( block ), insertPos, "after" );
        }
    } );

    var walker = new Walker();

    /* Some helper functions */
    function endBlock() {
        ctx.endBlock();
    }

    function forLoop( node, body ) {
        ctx.addLine( this.getStartLine( node ), this.getStartPos( node ) );
        ctx.startBlock( Block.TYPES.LOOP, this.getStartLine( body[0] ), this.getStartPos(  body[0] ) );
    }

    function breakContFn( node ) {
        ctx.addLine( this.getStartLine( node ), this.getStartPos( node ) );
        ctx.resetBlockType( Block.TYPES.LOOP );
        return false;
    }

    function beforeIfAlternate( node, alternate ) {
        if( alternate[0].type !== 'ElseifStatement' ) {
            ctx.startBlock( Block.TYPES.OTHER, this.getStartLine( alternate[0] ), this.getStartPos( alternate[0] ) );
        }
    }

    function afterIfAlternate( node, alternate ) {
        if( alternate[0].type !== 'ElseifStatement' ) {
            ctx.endBlock();
        }
    }

    // make these callbacks do nothing but not cancel.
    walker.on( [ "FunctionDeclaration",
        "IfStatement", "ElseifStatement",
        "ForStatement", "ForCStyleStatement", "ForInStatement" ], noop );

    // these callbacks end blocks
    walker.on( [
        'after:ForStatement.body', 'after:ForCStyleStatement.body', 'after:ForInStatement.body',
        'after:IfStatement.consequent', 'after:ElseifStatement.consequent',
        'after:SwitchCase.consequent', 'after:RepeatStatement.body', 'after:WhileStatement:body'  ], endBlock );

    // cancel traversal.
    walker.on( [
        'before:FunctionDeclaration.params',
        'before:ElseifStatement.test',
        'before:SwitchCase.test',
        'before:RepeatStatement.test'], skipTraverse );

    // handle loops
    walker.on( [
        'before:WhileStatement.body', 'before:RepeatStatement.body',
        'before:ForStatement.body', 'before:ForInStatement.body', 'before:ForCStyleStatement' ], forLoop );

    // handle break/continue.
    walker.on( [
        'BreakStatement', 'ContinueStatement', 'BreakIfStatement', 'ContinueIfStatement' ], breakContFn );

    walker.on( {
        'before:FunctionDeclaration.body': function( node, body ) {
            ctx.setFunction( node.name );
            editList.insert( "Assoc __cov = Assoc.CreateAssoc( 0 )\n", this.getStartPos( body[0] ), "after" );
            functions[node.name] = ctx.startBlock( Block.TYPES.FUNCTION, this.getStartLine( node ), this.getStartPos( body[0] ) );
        },

        'after:FunctionDeclaration.body': function( node, body ) {
            ctx.endBlock();
            var lastStmt = body[body.length - 1];
            if( lastStmt.type !== 'ReturnStatement' ) {
                editList.insert( "\n$_C.v( __cov )", this.getEndPos( lastStmt )+1, "before" );
            }
        },

        'before:IfStatement.test': function( node, test ) {
            ctx.addLine( this.getStartLine( node ), this.getStartPos( node ) );
            ctx.addLine( this.getStartLine( test[0] ), this.getStartPos( test[0] ) );
        },

        'before:IfStatement.consequent': function( node, consequent ) {
            ctx.startBlock( Block.TYPES.OTHER, this.getStartLine( consequent[0] ), this.getStartPos( consequent[0] ) );
        },

        'before:ElseifStatement.consequent': function( node, consequent ) {
            ctx.startBlock( Block.TYPES.OTHER, this.getStartLine( node ), this.getStartPos( consequent[0] ) );
            ctx.addLine( this.getStartLine( node.test[0] ), this.getStartPos( node.test[0] ) );
        },

        'before:IfStatement.alternate': beforeIfAlternate,
        'before:ElseifStatement.alternate': beforeIfAlternate,
        'after:IfStatement.alternate': afterIfAlternate,
        'after:ElseifStatement.alternate': afterIfAlternate,

        'before:SwitchCase.consequent': function( node, consequent ) {
            ctx.startBlock( Block.TYPES.OTHER, this.getStartLine( consequent[0] ), this.getStartPos( consequent[0] ) );
        },

        ReturnStatement: function( node ) {
            ctx.addLine( this.getStartLine( node ), this.getStartPos( node ) );
            ctx.resetBlockType( Block.TYPES.FUNCTION );
            editList.insert( "$_C.v( __cov )\n", this.getStartPos( node), "after" );
            return false;
        },

        // catch all (if not above).
        '*': function(node,children,when) {
            if( !when ) {
                ctx.addLine( this.getStartLine( node ), this.getStartPos( node ) );
            }
        }
    }).start( parseNode );

    if( options.debug ) {
        var blockSummary = ctx.getBlocks().map( function(b) {
            return b.id + " -> Ranges: " + JSON.stringify( b.ranges );
        } ).join( "\n" );

        editList.insert( "/*\n" + blockSummary + "\n*/\n", src.length );
    }

    return {
        result: editList.apply(),
        blocks: ctx.getBlocks(),
        functions: functions
    };
};