const _ = require("lodash"),
    walk = require("../walk"),
    cmp = require("../compare"),
    { getStaticStr, getStaticList } = require("../staticval");

const { getNode, getNodeProp } = require("../nodeutil");

class Builder {
    constructor(cfg, current) {
        this.cfg = cfg;
        this.current = current;
        this.lblocks = {};
        this.targets = null;
    }
    stmt(s) {
        if (_.isArray(s)) {
            return this.stmtList(s);
        }

        if (_.isNil(s)) {
            return;
        }

        if (s.label === true) {
            var label = this.labeledBlock(s.value);
            this.jump(label._goto);
            this.current = label._goto;
            return;
        }

        // The label of the current statement.  If non-nil, its _goto
        // target is always set; its _break and _continue are set only
        // within the body of switch/typeswitch/select/for/range.
        // It is effectively an additional default-nil parameter of stmt().
        var block = null;

        switch (s.type) {
            case "ReturnStatement":
                this.add(s);
                this.current = this.newUnreachableBlock("unreachable.return");
                break;
            case "BreakStatement": {
                var block = null;
                for (var t = this.targets; t && !block; t = t.tail) {
                    block = t._break;
                }
                if (block === null) {
                    block = this.newBlock("undefined.branch");
                }
                this.jump(block);
                this.current = this.newUnreachableBlock("unreachable.branch");
                break;
            }
            case "BreakIfStatement": {
                this.stmt(s.argument);
                let done = this.newBlock("breakif.done");

                var block = null;
                for (var t = this.targets; t && !block; t = t.tail) {
                    block = t._break;
                }
                if (block === null) {
                    block = this.newBlock("undefined.branch");
                }
                this.ifelse(block, done);
                this.current = done;
                break;
            }
            case "ContinueIfStatement": {
                this.stmt(s.argument);
                let done = this.newBlock("continueif.done");

                var block = null;
                for (var t = this.targets; t && !block; t = t.tail) {
                    block = t._continue;
                }
                if (block === null) {
                    block = this.newBlock("undefined.branch");
                }
                this.ifelse(block, done);
                this.current = done;
                break;
            }
            case "ContinueStatement":
                for (var t = this.targets; t && !block; t = t.tail) {
                    block = t._continue;
                }
                if (block === null) {
                    block = this.newBlock("undefined.branch");
                }
                this.jump(block);
                this.current = this.newUnreachableBlock("unreachable.branch");
                break;
            case "GotoStatement":
                block = this.labeledBlock(s.argument.value)._goto;
                if (_.isNil(block)) {
                    block = this.newBlock("undefined.branch");
                }
                this.jump(block);
                this.current = this.newUnreachableBlock("unreachable.branch");
                break;
            case "IfStatement":
            case "ElseifStatement": {
                var then = this.newBlock("if.then");
                var done = this.newBlock("if.done");
                var _else = done;
                if (s.alternate) {
                    _else = this.newBlock("if.else");
                }
                // add condition.
                this.add(s.test);
                // add successors
                this.ifelse(then, _else);
                // processes body.
                this.current = then;
                this.stmt(s.consequent);
                // successors
                this.jump(done);
                if (s.alternate) {
                    this.current = _else;
                    this.stmt(s.alternate);
                    this.jump(done);
                }
                this.current = done;
                break;
            }
            case "SwitchStatement":
                return this.switchStmt(s);
            case "ForInStatement":
                return this.forInStmt(s);
            case "ForStatement":
            case "ForCStyleStatement":
                return this.forStmt(s);
            case "WhileStatement":
                return this.whileStmt(s);
            case "RepeatStatement":
                return this.repeatStmt(s);

            default:
                this.add(s);
        }
    }

    switchStmt(s) {
        this.stmt(s.discriminant);

        // oscript only supports constant expressions in case
        // conditions, so the cases don't need to be evaluated...

        if (s.cases) {
            var switchStart = this.current;
            var done = this.newBlock("switch.done");

            s.cases.forEach(v => {
                if (!_.isNil(v.consequent)) {
                    var caseBlock = this.newBlock("switch.case");

                    this.jump(caseBlock);
                    this.current = caseBlock;
                    this.stmt(v.consequent);
                    this.jump(done);
                    this.current = switchStart;
                }
            });

            this.current = done;
        }
    }

    pushTargets(t) {
        this.targets = Object.assign.apply({}, [t, { tail: this.targets }]);
    }

    popTargets() {
        this.targets = this.targets.tail;
    }

    forInUnrolled(varNode, staticList, rangeNode) {
        var start = this.current;
        var done = this.newBlock("unroll.done");

        staticList.forEach(staticVal => {
            var block = this.newBlock("loop.value");
            this.jump(block);
            this.current = block;
            this.add(
                makeAssignment(varNode, staticVal, { range: rangeNode.range, loc: rangeNode.loc })
            );
            this.jump(done);
            this.current = start;
        });

        this.current = done;
    }

    forInStmt(s) {
        var loop = this.newBlock("forin.loop");
        this.jump(loop);
        this.current = loop;

        const forInExpr = getNode(s.first);
        const varNode = getNode(forInExpr.left);
        const listNode = getNode(forInExpr.right);
        const list = getStaticList(listNode);

        if (list !== null) {
            // we can unroll the loop...
            this.forInUnrolled(varNode, list, forInExpr);
        } else {
            // not fully static --
            this.add(s.first);
        }

        var body = this.newBlock("forin.body");
        var done = this.newBlock("forin.done");

        this.ifelse(body, done);
        this.current = body;

        this.pushTargets({ _break: done, _continue: loop });
        this.stmt(s.body);
        this.popTargets();

        this.jump(loop); // back-edge
        this.current = done;
    }

    forStmt(s) {
        if (!_.isNil(s.first)) {
            this.stmt(s.first);
        }
        let body = this.newBlock("for.body");
        let done = this.newBlock("for.done"); // target of 'break'
        let loop = body; // target of back-edge
        if (!_.isNil(s.second)) {
            loop = this.newBlock("for.loop");
        }
        let cont = loop; // target of 'continue'
        if (!_.isNil(s.third)) {
            cont = this.newBlock("for.post");
        }

        this.jump(loop);
        this.current = loop;

        if (loop !== body) {
            this.add(s.second);
            this.ifelse(body, done);
            this.current = body;
        }

        this.pushTargets({ _break: done, _continue: cont });
        this.stmt(s.body);
        this.popTargets();

        this.jump(cont);

        if (!_.isNil(s.third)) {
            this.current = cont;
            this.stmt(s.third);
            this.jump(loop); // back-edge
        }
        this.current = done;
    }

    whileStmt(s) {
        let body = this.newBlock("while.body");
        let done = this.newBlock("while.done"); // target of 'break'
        let loop = this.newBlock("while.loop");
        let cont = loop; // target of 'continue'
        this.jump(loop);
        this.current = loop;

        this.add(s.test);
        this.ifelse(body, done);
        this.current = body;

        this.pushTargets({ _break: done, _continue: cont });
        this.stmt(s.body);
        this.popTargets();

        this.jump(cont);
        this.current = done;
    }

    repeatStmt(s) {
        let body = this.newBlock("repeat.body");
        let done = this.newBlock("repeat.done"); // target of 'break'
        let loop = this.newBlock("repeat.loop"); // (test) target of continue
        let cont = loop; // target of 'continue'

        this.current = body;

        this.pushTargets({ _break: done, _continue: cont });
        this.stmt(s.body);
        this.popTargets();

        this.jump(loop);
        this.current = loop;

        this.add(s.test);
        this.ifelse(body, done);

        this.current = done;
    }

    // labeledBlock returns the branch target associated with the
    // specified label, creating it if needed.
    labeledBlock(label) {
        let lb = this.lblocks[label];
        if (_.isNil(lb)) {
            lb = { _goto: this.newBlock(label) };
            if (_.isNil(this.lblocks)) {
                this.lblocks = {};
            }
            this.lblocks[label] = lb;
        }
        return lb;
    }

    newUnreachableBlock(comment) {
        let block = this.newBlock(comment);
        block.unreachable = true;
        return block;
    }

    newBlock(comment) {
        var g = this.cfg;
        var block = new Block(comment, g.blocks.length);
        g.blocks.push(block);
        return block;
    }
    add(n) {
        this.current.nodes = append(this.current.nodes, n);
    }
    // jump adds an edge from the current block to the target block,
    // and sets this.current to nil.
    jump(target) {
        this.current.succs = append(this.current.succs, target);
        this.current = null;
    }
    // ifelse emits edges from the current block to the t and f blocks,
    // and sets this.current to nil.
    ifelse(t, f) {
        this.current.succs = append(this.current.succs, t, f);
        this.current = null;
    }
    stmtList(sList) {
        if (_.isArray(sList)) {
            // handle statement lists...
            sList.forEach(s => this.stmt(s));
        } else {
            return this.stmt(sList);
        }
    }
}

function append(nodes, n) {
    if (arguments.length <= 1) {
        return [];
    }

    var elems = [].slice.call(arguments, 1);

    if (nodes === null || typeof nodes === "undefined") {
        return elems;
    }
    [].push.apply(nodes, elems);
    return nodes;
}

class CFG {
    constructor() {
        this.blocks = [];
    }

    build(root) {
        var b = new Builder(this, null);
        b.current = b.newBlock("entry");
        b.stmt(root.body);

        return b.cfg;
    }

    findPaths() {
        let pathCount = 0;

        if (this.blocks.length > 105) {
            console.error("********** TOO MANY BLOCKS ****************");
            console.error(this.blocks.length);
            console.error("*******************************************");
            return [];
        }

        let indexMap = [];
        this.blocks.forEach(b => (indexMap[b.index] = b));

        let paths = [];

        const addPath = p => {
            paths.push(p);
        };

        const walkTree = (chain, node) => {
            let nextNodes = [];
            if (node.succs) {
                nextNodes = node.succs.filter(s => chain.indexOf(s.index) === -1);

                if (node.nodes.length) {
                    nextNodes.forEach(n => walkTree([...chain, node.index], n));
                } else {
                    nextNodes.forEach(n => walkTree(chain, n));
                }
            }

            if (nextNodes.length === 0) {
                // nowhere to go -- add to list.
                addPath([...chain, node.index]);
            }
        };

        // paths is a list of lists of blocks...
        let entry = this.blocks[0];
        walkTree([], entry);

        console.log("Path count: ", pathCount);

        return paths.map(p => p.map(nIndex => indexMap[nIndex]));
    }

    /*
    addComputationBranches(paths) {
        let rtn = [];
        paths.map(p => this.computeBranches(p)).reduce((p, c) => [].push.apply(p, c), rtn);
        return rtn;
    }

    computeBranches(path) {
        // As long as we use existing tokens, we can add additional
        // paths through modified blocks to simulate different code paths
        // through loops and ternary expressions.

        return [path];
    }
    */

    printPaths(code) {
        this.findPaths().forEach(path => {
            console.log("----------------------------------------------------");
            console.log("Possible path: ");

            path.forEach(b => {
                let cd = b.getCode(code);
                cd =
                    "    " +
                    cd
                        .replace(/\n|$/, "            [" + b.comment + "]\n")
                        .replace(/\n/g, "\n    ");
                console.log(cd);
            });
            this.traceVars(path);
        });
    }

    traceVars(path) {
        let vars = {};
        for (let b of path) {
            vars = b.traceVars(vars);
        }
        console.log("Vars: ", JSON.stringify(vars, null, 2));
    }

    traceVarsTo(path, node) {
        let vars = {};
        for (let b of path) {
            if (b.containsNode(node)) {
                vars = b.traceVars(vars, node.range[0]);
                break;
            } else {
                vars = b.traceVars(vars);
            }
        }
        return vars;
    }
}

const isQuery = node => {
    const n = getNode(node);

    if (!n || !n.callee) {
        return false;
    }

    const callee = getNodeProp(n, "callee");

    if (!callee || callee.type !== "MemberExpression") {
        return false;
    }

    const propertyVal = (getNodeProp(callee, "property", "value") || "").toLowerCase();
    const objVal = (getNodeProp(callee, "object", "value") || "").toLowerCase();

    if (objVal === "capi" && n.arguments && n.arguments.length > 1) {
        if (propertyVal === "exec") {
            return { type: "CAPI.Exec", statement: n.arguments[1] };
        } else if (propertyVal === "execn") {
            return true;
        }
        return false;
    }

    if (
        (propertyVal === "execsql" || propertyVal === "query") &&
        n.arguments &&
        n.arguments.length > 1
    ) {
        // same semantics -- just use execsql
        return true;
    } else if (propertyVal === "exec" && objVal && n.arguments && n.arguments.length > 0) {
        // prgCtx and dbConnect both have an exec function...
        return true;
    }

    return false;
};

class Block {
    constructor(comment, index) {
        this.comment = comment;
        this.index = index;
        this.nodes = [];
        this.succs = [];
        this.unreachable = false;
    }

    hasRelevantStatements() {
        let isRelevant = false;

        let visit = (n, label) => {
            if (!n) return;

            if (isAssignment(n)) {
                isRelevant = true;
                return false;
            } else if (isDeclr(n)) {
                if (["string", "integer"].indexOf(n.dataType.value.toLowerCase()) !== -1) {
                    isRelevant = true;
                    return false;
                }
                return;
            } else if (n.type === "CallExpression" && isQuery(n)) {
                isRelevant = true;
                return false;
            }

            return visit;
        };

        walk(visit, this.nodes);

        return isRelevant;
    }

    containsNode(node) {
        if (this.nodes.length > 0) {
            let firstNode = getNode(this.nodes[0]);
            let lastNode = getNode(this.nodes[this.nodes.length - 1]);

            var start = firstNode.range[0];
            var end = lastNode.range[1];

            return node.range[0] >= start && node.range[1] <= end;
        }
        return false;
    }

    getCode(code) {
        if (this.nodes.length > 0) {
            var start = getNode(this.nodes[0]).range[0];
            var end = getNode(this.nodes[this.nodes.length - 1]).range[1];

            return code.substring(start, end + 1);
        }
        return "";
    }

    get code() {
        return this.nodes.length ? this.nodes.map(v => v.code || "").join("\n") : "";
    }

    traceVars(varsIn, maxStartRange, assignFirst) {
        let varsOut = _.clone(varsIn);

        let visit = (n, label) => {
            if (!n) return;

            if (maxStartRange && n.range && n.range[0] > maxStartRange) {
                return;
            }

            if (isAssignment(n)) {
                let varName = getNode(n.left).value.toLowerCase();
                let staticVal = getStaticStr(n.right, varsOut);

                if (staticVal === null) {
                    // kill the variable --- not computable...
                    varsOut[varName] = null;
                } else {
                    // update the output.
                    if (n.operator === "=") {
                        varsOut[varName] = staticVal;
                    } else if (n.operator === "+=") {
                        if (assignFirst && _.isNull(varsOut[varName])) {
                            // not allowed...
                            varsOut[varName] = null;
                        } else if (varsOut.hasOwnProperty(varName) && varsOut[varName] !== null) {
                            varsOut[varName] = varsOut[varName].plus(staticVal);
                        } else if (!assignFirst && !varsOut.hasOwnProperty(varName)) {
                            varsOut[varName] = staticVal;
                        }
                    } else {
                        console.log("Unknown operator: ", n.operator);
                        varsOut[varName] = null;
                    }
                }

                return;
            } else if (isDeclr(n)) {
                let varName = getNode(n.name).value.toLowerCase();

                if (varsIn.hasOwnProperty(varName) && varsIn[varName].value !== "") {
                    console.log("shadowed variable ", varName, " -- skipping ...");
                    varsOut[varName] = null;
                    return;
                }

                let val = getStaticStr("");

                if (n.init) {
                    val = getStaticStr(n.init, varsOut);

                    if (val === null) {
                        // don't add the var.
                        return;
                    }
                }

                varsOut[varName] = val;
                return;
            }

            return visit;
        };

        walk(visit, this.nodes);

        return varsOut;
    }
}

var varInit = {
    type: "VariableDeclarator",
    name: {
        arity: "name"
    },
    dataType: {
        arity: "name"
    }
};

const makeAssignment = (varNode, staticNode, rangeNode) => {
    return Object.assign(
        {
            value: "=",
            arity: "binary",
            left: varNode,
            right: staticNode,
            assignment: true,
            type: "AssignmentExpression",
            operator: "=",
            id: "="
        },
        rangeNode
    );
};

function isAssignment(node) {
    node = getNode(node);

    if (node.type === "AssignmentExpression") {
        lVal = getNode(node.left);

        if (lVal.arity === "name") {
            // only tracking assignments to normal variables...
            return true;
        }
    }
    return false;
}

function isDeclr(node) {
    return cmp(getNode(node), varInit);
}

module.exports = CFG;
