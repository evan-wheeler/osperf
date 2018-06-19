var _ = require("lodash"),
    walk = require( './walk' ),
    cmp = require( "../compare" );

class Builder { 
    constructor(cfg, current) {
        this.cfg = cfg;
        this.current = current;
        this.lblocks = {};
        this.targets = null;
    }
    stmt(s) {
        if (s.label === true) {
            var label = this.labeledBlock(s.value);
            this.jump(label._goto);
            this.current = label._goto;
            return; 
        }

        if (_.isArray(s)) {
            return this.stmtList(s);
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
            case "ForStatement":
                return this.forStmt(s);
            case "ForCStyleStatement":
                return this.forCStyle(s);
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

    forStmt(s) {
        this.stmt(s.first);

        // for x in {...} doesn't use second and third.
        if (!_.isNil(s.second)) {
            this.stmt(s.second);
        }
        if (!_.isNil(s.third)) {
            this.stmt(s.third);
        }

        var loop = this.newBlock("for.loop");
        this.jump(loop);
        this.current = loop;

        var body = this.newBlock("for.body");
        var done = this.newBlock("for.done");
        this.ifelse(body, done);
        this.current = body;

        this.targets = {
            tail: this.targets,
            _break: done,
            _continue: loop
        };
        this.stmt(s.body);
        this.targets = this.targets.tail;
        this.jump(loop); // back-edge
        this.current = done;
    }

    forCStyle(s) {
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
        this.targets = {
            tail: this.targets,
            _break: done,
            _continue: cont
        };
        this.stmt(s.body);
        this.targets = this.targets.tail;
        this.jump(cont);

        if (!_.isNil(s.third)) {
            this.current = cont;
            this.stmt(s.third);
            this.jump(loop); // back-edge
        }
        this.current = done;
    }

    // labeledBlock returns the branch target associated with the
    // specified label, creating it if needed.
    labeledBlock(label) {
        var lb = this.lblocks[label];
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
        let paths = [];
        
        function walkSuccs(preds, next ) { 
            if( _.indexOf( preds, next ) >= 0 ) {
                // already visited this block...
                return false;
            }

            let newPath = _.clone( preds );
            newPath.push( next );

            let anyNew = next.succs.map( n => walkSuccs( newPath, n ) ).find( v => !!v );

            if( !anyNew ) {  
                paths.push( newPath )
            }

            return true;
        }

        // paths is a list of lists of blocks... 
        let entry = this.blocks[0]

        walkSuccs( [], entry );
        return paths
    }

    printPaths(code) { 
        this.findPaths().forEach( path => {
            console.log( "----------------------------------------------------" );
            console.log( "Possible path: " );

            path.forEach( b => { 
                console.log( "===> ", b.comment );
                console.log( b.getCode(code) );
            })
            this.traceVars( path )
        } )
    }

    traceVars(path) { 
        let vars = {};
        for( let b of path ) {
            vars = b.traceVars( vars );
        }
        console.log( "Vars: ", JSON.stringify( vars, null, 2 ) );
    }
}

class Block {
    constructor(comment, index) {
        this.comment = comment;
        this.index = index;
        this.nodes = [];
        this.succs = [];
        this.unreachable = false;
    }

    containsNode(node) { 
        if( this.nodes.length > 0 ) { 
            var start = this.nodes[0].range[0];
            var end = this.nodes[this.nodes.length - 1].range[1];

            return node.range[0] >= start && node.range[1] <= end;
        }
        return false;
    }

    getCode(code) {
        if( this.nodes.length > 0 ) { 
            var start = this.nodes[0].range[0];
            var end = this.nodes[this.nodes.length - 1].range[1];

            return code.substring(start,end+1)
        }
        return "<none>"
    }

    traceVars(varsIn) { 
        let varsOut = _.clone( varsIn );

        let visit = (n) => { 
            if( !n ) return;

            if( isAssignment( n ) ) {
                let varName = n.left.value.toLowerCase(); 
                let staticVal = getStaticStr( n.right, varsOut );

                if( staticVal === null )  {
                    // kill the variable --- not computable...
                    delete varsOut[varName]
                } else {
                    // update the output.
                    if( n.operator === "=" ) { 
                        varsOut[varName] = staticVal;
                    }
                    else if( n.operator === "+=" ) {
                        varsOut[varName] += staticVal;
                    }
                    else {
                        delete varsOut[varName]
                    }
                }

                return;
            }
            else if( isDeclr( n ) ) { 
                let varName = n.name.value.toLowerCase();

                if( varsIn[varName] ) {
                    console.log( "shadowed variable ", varName, " -- skipping ...")
                    delete varsOut[varName]
                    return;
                }

                let val = "";

                if (n.init) {
                    val = getStaticStr(n.init, varsOut);

                    if( val === null )  {
                        // don't add the var.
                        return;
                    }    
                }

                varsOut[varName] = val; 
                return;
            }

            return visit;            
        }

        walk( visit, this.nodes )

        return varsOut;
    }
};
 
var getStaticStr = function(node, vars) {
    if (_.isArray(node) && node.length === 1) {
        return getStaticStr(node[0], vars);
    }

    // If literal string, just return value.
    if (node.arity === "literal" && typeof node.value === "string") {
        return node.value;
    }

    if (node.arity === "name") {
        if (typeof vars[node.value] === "string") {
            let varName = node.value.toLowerCase()
            return vars[varName];
        }
    }

    // if $DT_TABLE, return [DTree];
    if (cmp(node, dtTable)) {
        // We don't use this format, but it's valid SQL to parse, so this
        // will be our hint that we need to replace it with $DT_TABLE
        return "[DTree]";
    }

    // If static_str + static_str then return result of concatenation.
    if (node.type === "BinaryExpression" && node.operator === "+") {
        var left = getStaticStr(node.left, vars);
        var right = getStaticStr(node.right, vars);

        if (left === null || right === null) {
            return null;
        }

        return left + right;
    }

    return null;
}

var dtTable = {
    value: "$",
    arity: "unary",
    argument: {
        value: "DT_TABLE",
        arity: "literal"
    },
    type: "UnaryExpression",
    operator: "$",
    prefix: true
};

var varInit = {
    type: "VariableDeclarator",
    name: {
        arity: "name"
    },
    dataType: {
        value: "String",
        arity: "name"
    }
};

var assignment = {
    arity: "binary",
    left: {
        arity: "name"
    },
    right: {},
    type: "AssignmentExpression"
};

function isAssignment(node) {
    return cmp(node, assignment);
}

function isDeclr(node) {
    return cmp(node, varInit);
}


module.exports = CFG;
