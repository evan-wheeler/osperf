var EditList = require("./../edits"),
    Walker = require("bannockburn").Walker,
    _ = require("lodash");

/**
 * Block class
 * Each block represents one or more lines of code that will
 * have to execute if the beginning of the block is reached.
 */
function Block(blockType, id, startLine) {
    this.lines = [startLine];
    this.id = id;
    this.type = blockType;
    this.reset = false;
}

/**
 * Adds a covered line to the block.
 * @param line  The line of code to add to the current block.
 */
Block.prototype.addLine = function(line) {
    if (_.isNumber(line) && line >= 0) {
        if (_.indexOf(this.lines, line) === -1) {
            this.lines.push(line);
        }
    }
};

Block.TYPES = {
    FUNCTION: 0,
    LOOP: 1,
    OTHER: 2
};

function defaultIDGenerator(info) {
    return info.func + "[" + info.block + "]";
}

/**
 * Creates a BlockTracker, which is used to keeps track of the code coverage blocks
 * @class
 */
function BlockTracker(options) {
    options = options || {};

    var curFunction = null,
        blockStack = [],
        blocks = [],
        blockIndex = 0,
        rawScript = false;

    var idGenerator = options.idGenerator || defaultIDGenerator,
        visitFn = options.visitFn,
        headerFn = options.headerFn,
        scope = options.scope || this;

    /**
     * Sets the current function.
     * @param {string} name The name of the function
     */
    this.setFunction = function(name) {
        if (blockStack.length > 0) {
            this.endBlock();
        }

        curFunction = name;
    };

    /**
     * Gets the current function
     * @returns {*} the current function name or null
     */
    this.getFunction = function() {
        return curFunction;
    };

    /**
     * Determines if the script being processed has code outside of the first function body.
     * @returns {boolean} true if this script has raw code, false otherwise.
     */
    this.hasRawCode = function() {
        return rawScript;
    };

    /**
     * Adds a line into the appropriate block, which is normally the block that
     * is on the top of the stack.
     *
     * @param {Integer} line - The line that should be included.
     * @param {Integer} insertPos - The character index where instrumentation should be inserted if needed.
     */
    this.addLine = function(line, insertPos) {
        if (blockStack.length === 0) {
            if (rawScript) {
                throw Error("Extraneous input after last function is invalid.");
            }

            // We're outside of all functions.
            this.startBlock(Block.TYPES.FUNCTION, line, insertPos, true);
            rawScript = true;
        }

        var top = blockStack[blockStack.length - 1];

        if (top.reset) {
            this.endBlock();
            this.startBlock(top.type, line, insertPos);
        } else {
            top.addLine(line);
        }
    };

    /**
     * Starts a new block
     * @param {Integer} type - The block type.
     * @param {Integer} line - The line where the block begins.
     * @param {Integer} insertPos - The character index where instrumentation should be inserted.
     * @param {boolean} [addHeader] - True to add the entry code header.
     */
    this.startBlock = function(type, line, insertPos, addHeader) {
        if (line > -1 && insertPos > -1) {
            var blockID = idGenerator.call(scope, {
                    func: curFunction,
                    block: blockIndex++
                }),
                block = new Block(type, blockID, line);

            /*
            if( blockStack.length > 0 ) {
                blockStack[blockStack.length - 1].interrupt();
            }
            */

            blockStack.push(block);
            blocks.push(block);

            // add the visit mark here.
            if (addHeader) {
                headerFn(null, insertPos);
            }

            visitFn.call(options.scope, block, insertPos);

            return block;
        }
        throw Error("Invalid startBlock argument(s): " + JSON.stringify(arguments));
    };

    /**
     * Ends a block
     */
    this.endBlock = function() {
        return blockStack.pop();
    };

    /**
     * Traverses the stack, resetting blocks until a block of type blockType is found.
     * @param {Integer} blockType - The type of block to find.
     */
    this.resetBlockType = function(blockType) {
        var i = blockStack.length;

        while (i--) {
            var p = blockStack[i];

            p.reset = true;

            if (p.type === blockType) {
                break;
            }
        }
    };

    /**
     * Returns the blocks that were defined.
     */
    this.getBlocks = function() {
        return blocks.map(function(v) {
            return {
                id: v.id,
                lines: v.lines
            };
        });
    };
}

function noop() {
    return true;
}
function skipTraverse() {
    return false;
}

function isSimpleOp(node) {
    if (!node) {
        return true;
    }
    var arg = node[0];

    if (arg.id === "(name)" || arg.id === "(literal)" || arg.arity === "literal") {
        return true;
    } else if (arg.type === "MemberExpression") {
        return (
            (!arg.object ||
                arg.object.id === "(name)" ||
                arg.object.id === "(literal)" ||
                arg.object.arity === "literal") &&
            (arg.property &&
                (arg.property.id === "(name)" ||
                    arg.property.id === "(literal)" ||
                    arg.property.arity === "literal"))
        );
    }
    return false;
}

var VISIT_TMPL = _.template("__cov.('<%= id %>')+=1\n"),
    TIME_EXIT_TMPL = _.template("\n$_C.T('<%= blockID %>',__t,Date.MicroTick())"),
    TIME_RTN_TMPL = _.template("$_C.T('<%= blockID %>',__t,Date.MicroTick())\n"),
    TIME_RTN2_TMPL = _.template(
        "Dynamic __r<%= retID %> = <%= arg %>;$_C.T('<%= blockID %>',__t,Date.MicroTick());return __r<%= retID %>"
    );

module.exports = function coverage(src, parseNode, idGenerator, options) {
    var editList = new EditList(src),
        functions = [],
        funcBlockID = "",
        record_visits = "$_C.v( __cov, -1 )";

    options = options || {};

    var ctx = new BlockTracker({
        idGenerator: idGenerator,
        visitFn: function(block, insertPos) {
            editList.insert(VISIT_TMPL(block), insertPos, "after");
        },
        headerFn: function(block, insertPos) {
            editList.insert("Assoc __cov = Assoc.CreateAssoc( 0 )\n", insertPos, "after");
            editList.insert("$_C.depth += 1\n", insertPos, "after");
        }
    });

    var walker = new Walker();
    var rawScriptFix = false;

    /* Some helper functions */
    function endBlock() {
        ctx.endBlock();
    }

    var forLoop = function(node, body) {
        ctx.addLine(this.getStartLine(node), this.getStartPos(node));
        ctx.startBlock(Block.TYPES.LOOP, this.getStartLine(body[0]), this.getStartPos(body[0]));
    };

    var breakContFn = function(node) {
        ctx.addLine(this.getStartLine(node), this.getStartPos(node));
        ctx.resetBlockType(Block.TYPES.LOOP);
        return false;
    };

    var beforeIfAlternate = function(node, alternate) {
        if (alternate[0].type !== "ElseifStatement") {
            ctx.startBlock(
                Block.TYPES.OTHER,
                this.getStartLine(alternate[0]),
                this.getStartPos(alternate[0])
            );
        }
    };

    var afterIfAlternate = function(node, alternate) {
        if (alternate[0].type !== "ElseifStatement") {
            ctx.endBlock();
        }
    };

    // make these callbacks do nothing but not cancel.
    walker.on(
        [
            "FunctionDeclaration",
            "IfStatement",
            "ElseifStatement",
            "ForStatement",
            "ForCStyleStatement",
            "ForInStatement",
            "SwitchCase"
        ],
        noop
    );

    // these callbacks end blocks
    walker.on(
        [
            "after:ForStatement.body",
            "after:ForCStyleStatement.body",
            "after:ForInStatement.body",
            "after:IfStatement.consequent",
            "after:ElseifStatement.consequent",
            "after:SwitchCase.consequent",
            "after:RepeatStatement.body",
            "after:WhileStatement.body"
        ],
        endBlock
    );

    // cancel traversal.
    walker.on(
        [
            "before:FunctionDeclaration.params",
            "before:ElseifStatement.test",
            "before:SwitchCase.test",
            "before:RepeatStatement.test",
            "before:ForStatement.first",
            "before:ForStatement.second",
            "before:ForStatement.third",
            "before:ForInStatement.first",
            "before:ForCStyleStatement.first",
            "before:ForCStyleStatement.second",
            "before:ForCStyleStatement.third"
        ],
        skipTraverse
    );

    // handle loops
    walker.on(
        [
            "before:WhileStatement.body",
            "before:RepeatStatement.body",
            "before:ForStatement.body",
            "before:ForInStatement.body",
            "before:ForCStyleStatement.body"
        ],
        forLoop
    );

    // handle break/continue.
    walker.on(
        ["BreakStatement", "ContinueStatement", "BreakIfStatement", "ContinueIfStatement"],
        breakContFn
    );

    walker
        .on({
            "before:FunctionDeclaration.body": function(node, body) {
                if (ctx.hasRawCode()) {
                    if (ctx.getFunction() === null) {
                        editList.insert(record_visits + "\n", this.getStartPos(node), "after");
                        rawScriptFix = true;
                    }
                }

                var firstStmtPos = this.getStartPos(body[0]);

                ctx.setFunction(node.name);
                var funcBlock = ctx.startBlock(
                    Block.TYPES.FUNCTION,
                    this.getStartLine(node),
                    firstStmtPos,
                    true
                );

                funcBlockID = funcBlock.id;

                if (options.timings) {
                    editList.insert("Integer __t=Date.MicroTick()\n", firstStmtPos, "after");
                }

                functions.push(funcBlockID);
            },

            "after:FunctionDeclaration.body": function(node, body) {
                ctx.endBlock();
                var lastStmt = body[body.length - 1];
                if (lastStmt.type !== "ReturnStatement") {
                    if (options.timings) {
                        editList.insert(
                            TIME_EXIT_TMPL({ blockID: funcBlockID }),
                            this.getEndPos(lastStmt) + 1,
                            "before"
                        );
                    }

                    editList.insert("\n" + record_visits, this.getEndPos(lastStmt) + 1, "before");
                }
            },

            "before:IfStatement.test": function(node, test) {
                ctx.addLine(this.getStartLine(node), this.getStartPos(node));
                ctx.addLine(this.getStartLine(test[0]), this.getStartPos(test[0]));
            },

            "before:IfStatement.consequent": function(node, consequent) {
                ctx.startBlock(
                    Block.TYPES.OTHER,
                    this.getStartLine(consequent[0]),
                    this.getStartPos(consequent[0])
                );
            },

            "before:ElseifStatement.consequent": function(node, consequent) {
                ctx.startBlock(
                    Block.TYPES.OTHER,
                    this.getStartLine(node),
                    this.getStartPos(consequent[0])
                );
                ctx.addLine(this.getStartLine(node.test[0]), this.getStartPos(node.test[0]));
            },

            "before:IfStatement.alternate": beforeIfAlternate,
            "before:ElseifStatement.alternate": beforeIfAlternate,
            "after:IfStatement.alternate": afterIfAlternate,
            "after:ElseifStatement.alternate": afterIfAlternate,

            "before:SwitchCase.consequent": function(node, consequent) {
                ctx.startBlock(
                    Block.TYPES.OTHER,
                    this.getStartLine(consequent[0]),
                    this.getStartPos(consequent[0])
                );
            },

            ReturnStatement: function(node) {
                ctx.addLine(this.getStartLine(node), this.getStartPos(node));
                ctx.resetBlockType(Block.TYPES.FUNCTION);

                editList.insert(record_visits + "\n", this.getStartPos(node), "after");

                if (options.timings && funcBlockID) {
                    var arg = node.argument;

                    if (isSimpleOp(arg)) {
                        editList.insert({
                            str: TIME_RTN_TMPL({ blockID: funcBlockID }),
                            pos: this.getStartPos(node),
                            indent: "after"
                        });
                    } else {
                        var expr, start, end;
                        expr = src.substring(this.getStartPos(arg[0]), this.getEndPos(arg[0]) + 1);
                        start = this.getStartPos(node);
                        end = this.getEndPos(node);
                        editList.replace(
                            start,
                            end + 1,
                            TIME_RTN2_TMPL({ arg: expr, blockID: funcBlockID, retID: start })
                        );
                    }
                }

                return false;
            },

            // catch all (if not above).
            "*": function(node, children, when) {
                if (!when) {
                    ctx.addLine(this.getStartLine(node), this.getStartPos(node));
                }
            }
        })
        .start(parseNode);

    if (ctx.hasRawCode() && !rawScriptFix) {
        // close out the raw code unless the last statement was a return.
        var lastStmt =
            _.isArray(parseNode) && parseNode.length ? parseNode[parseNode.length - 1] : null;

        if (lastStmt && lastStmt.type !== "ReturnStatement") {
            editList.insert("\n" + record_visits, src.length, "before");
        }
    }

    // convert block data to

    return {
        result: editList.apply(),
        blocks: ctx.getBlocks(),
        functions: functions
    };
};
