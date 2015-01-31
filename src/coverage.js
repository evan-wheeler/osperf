var partialCompare = require( './compare' ),
    EditList = require( './edits' ),
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
 * @param line  Resets the end marker for the block
 */
Block.prototype.interrupt = function() {
    this.interrupted = true;
};

Block.TYPES = {
    FUNCTION: 0,
    LOOP: 1,
    OTHER: 2
};


/**
 * Creates a BlockTracker, which is used to keeps track of the code coverage blocks
 * @class
 */
function BlockTracker( scriptID, editList, idGenerator ) { 
    
    var functions = [],
        curFunction = null,
        blockStack = [],
        blocks = [],
        blockIndex = 0,
        rawScript = false;
    
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
            var blockID = idGenerator( scriptID, curFunction, blockIndex++ ),
                block = new Block( type, blockID, line );
            
            if( blockStack.length > 0 ) { 
                blockStack[blockStack.length - 1].interrupt();
            }
            
            blockStack.push( block );
            blocks.push( block );
                
            // make the edit.
            editList.insert( "$_C.v('" + blockID + "')\n", insertPos, { indent: "after" } );
        }
        else {
            throw Error( "Invalid startBlock argument(s): " + JSON.stringify( arguments ) );
        }
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

/* Helper Functions */
    
/**
 * Normalize a node that may be a (empty?) array of statements, 
 * a single item, or a null value. 
 * Return a non-empty array, or null.
 * @param {Array|Object} variant
 */
function normalBlk( variant ) {
    if( _.isArray( variant ) ) { 
        return variant.length ? variant : null;
    }   
    return variant ? [ variant ] : null;
}

/**
 * Returns the line associated with a parse node's start location
 * @param {Object} node - The node
 */
function startLine( node ) { 
    return node.loc.start.line;
}

/**
 * Returns the character index associated with a parse node's start location
 * @param {Object} node - The node
 */
function startPos( node ) { 
    return node.range[0];
}
    
/* Statement Types */
    
var statementTypes = {};
    
statementTypes.FunctionDeclaration = function( node, ctx ) { 

    ctx.setFunction( node.name );

    var funcBody = normalBlk( node.body );
    
    if( funcBody ) { 
        ctx.startBlock( Block.TYPES.FUNCTION, startLine( node ), startPos( funcBody[0] ) );
        walkTree( funcBody, ctx );
        ctx.endBlock();
    }
};
    
statementTypes.IfStatement = function( node, ctx ) { 

    ctx.addLine( startLine( node ), startPos( node ) );
    walkTree( node.test, ctx );
    
    var consequent = normalBlk( node.consequent );
    if( consequent ) { 
        ctx.startBlock( Block.TYPES.OTHER, startLine( consequent[0] ), startPos( consequent[0] ) );
        walkTree( consequent, ctx );
        ctx.endBlock();
    }
    
    var alt = node.alternate;
    if( alt ) { 
        if( _.isArray( alt ) ) { 
            if( alt.length ) { 
                // ELSE: add alternate block.
                ctx.startBlock( Block.TYPES.OTHER, startLine( alt[0] ), startPos( alt[0] ) );
                walkTree( alt, ctx );
                ctx.endBlock();
            }
        }
        else { 
            // ELSEIF: block will be handled inside.
            walkTree( alt, ctx );
        }
    }
};

statementTypes.ForStatement = statementTypes.ForCStyleStatement = function( node, ctx ) { 
    
    ctx.addLine( startLine( node ), startPos( node ) );
    walkTree( [ node.first, node.second, node.third ], ctx ); 
    
    var body = normalBlk( node.body );
        
    if( body ) { 
        ctx.startBlock( Block.TYPES.LOOP, startLine( body[0] ), startPos( body[0] ) );
        walkTree( body, ctx );
        ctx.endBlock();
    }
};

statementTypes.ForInStatement = function( node, ctx ) { 

    ctx.addLine( startLine( node ), startPos( node ) );
    walkTree( [ node.first, node.second ], ctx ); 
    
    var body = normalBlk( node.body );
        
    if( body ) { 
        ctx.startBlock( Block.TYPES.LOOP, startLine( body[0] ), startPos( body[0] ) );
        walkTree( body, ctx );
        ctx.endBlock();
    }
};

statementTypes.SwitchStatement = function( node, ctx ) { 
    ctx.addLine( startLine( node ), startPos( node ) );
    walkTree( node.discriminant, ctx ); 
    walkTree( normalBlk( node.cases ), ctx );
};

statementTypes.SwitchCase = function( node, ctx ) { 
    var consequent = normalBlk( node.consequent );
        
    if( consequent ) { 
        ctx.startBlock( Block.TYPES.OTHER, startLine( consequent[0] ), startPos( consequent[0] ) );
        walkTree( consequent, ctx );
        ctx.endBlock();
    }
};

statementTypes.BreakStatement = function( node, ctx ) { 
    ctx.addLine( startLine( node ), startPos( node ) );
    
    // reset the closest loop.
    ctx.resetBlockType( Block.TYPES.LOOP );
};

statementTypes.BreakStatement = statementTypes.ContinueStatement = function( node, ctx ) { 
    ctx.addLine( startLine( node ), startPos( node ) );
    
    // reset the closest loop.
    ctx.resetBlockType( Block.TYPES.LOOP );
};

statementTypes.ContinueIfStatement = statementTypes.BreakIfStatement = function( node, ctx ) { 
    ctx.addLine( startLine( node ), startPos( node ) );
    walkTree( node.first, ctx );
    
    // reset the closest loop.
    ctx.resetBlockType( Block.TYPES.LOOP );
};

statementTypes.ReturnStatement = function( node, ctx ) { 
    ctx.addLine( startLine( node ), startPos( node ) );
    walkTree( node.argument, ctx );
    
    // reset the closest loop.
    ctx.resetBlockType( Block.TYPES.FUNCTION );
};

statementTypes.OtherStatements = function( node, ctx ) { 
    ctx.addLine( startLine( node ), startPos( node ) );

    [ 'argument', 'expression', 'init', 'elements', 'left', 'right', 'first', 'second', 'third', 'fourth', 'body', 'alternate' ].forEach( function( v ) {
        if( node[v] ) { 
            walkTree( node[v], ctx );
        }
    } );    
};

/** 
 * Walks a parse tree and discovers code blocks
 * along the way.
 * @param parseTree A node or array of nodes
 * @param ctx  The parsing context class.   
 */
function walkTree( parseTree, ctx ) {
    var statements = normalBlk( parseTree );
    
    if( statements ) { 
        statements.forEach( function( n ) { 
            if( n ) { 
                ( statementTypes[n.type] || statementTypes.OtherStatements )( n, ctx );
            }
        } );
    }
}

function defaultIDGenerator( scriptID, functionName, blockIndex ) {     
    return scriptID + ":" + functionName + "[" + blockIndex + "]";
}
    
module.exports = function coverage( scriptID, src, parseNode, options ) {

    options = options || {};
    options.idGenerator = options.idGenerator || defaultIDGenerator;
    
    var editList = new EditList( src );
    var tracker = new BlockTracker( scriptID, editList, options.idGenerator );
    
    walkTree( parseNode, tracker );
    
    /*
    var blockSummary = tracker.getBlocks().map( function(b) { 
        return b.id + " -> Ranges: " + JSON.stringify( b.ranges );
    } ).join( "\n" );
    */
    // editList.insert( "/*\n" + blockSummary + "\n*/", src.length );
    
    return editList.apply();
};