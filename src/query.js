const parser = require("./sqlparser").parse,
    _ = require("lodash"),
    walk = require("./walk"),
    schema = require("./assets/schema.json"),
    Edits = require("./edits");

// ast walk rules...
const rules = [
    [{ type: "statement", variant: "list" }, ["statement"]],
    [
        { type: "statement", variant: "select" },
        ["from", "result", "where", "group", "having", "order"]
    ],
    [{ type: "statement", variant: "insert" }, ["into", "result"]],
    [{ type: "statement", variant: "delete" }, ["from", "where"]],
    [{ type: "statement", variant: "update" }, ["into", "set", "where"]],
    [{ type: "statement", variant: "compound" }, ["statement", "compound"]],
    [{ type: "compound" }, ["statement"]],
    [{ type: "function" }, ["args"]],
    [{ type: "identifier", format: "table", variant: "expression" }, ["target", "columns"]],
    [{ type: "assignment" }, ["target", "value"]],
    [{ type: "expression", format: "binary" }, ["left", "right"]],
    [{ type: "expression", format: "unary" }, ["expression"]],
    [{ type: "expression", variant: "list" }, ["expression"]],
    [{ type: "expression", variant: "order" }, ["expression"]],
    [{ type: "map", variant: "join" }, ["source", "map"]],
    [{ type: "map", type: "join" }, ["source", "constraint"]],
    [{ type: "constraint", variant: "join" }, ["on"]],
    [{ type: "join" }, ["source"]]
];

const nextChildren = n => {
    let rule = rules.find(r => _.isMatch(n, r[0]));
    return rule ? rule[1] : [];
};

class Scope {
    constructor(parent) {
        this.parent = parent || null;

        this.tables = [];
        this.columns = {};

        this.tblMap = {};
        this.colMap = {};
    }

    addTable(name, alias, columns) {
        const tblAlias = typeof alias === "string" ? alias : name;
        const tblRec = {
            name,
            alias,
            lookup: tblAlias.toLowerCase(),
            ref: tblAlias,
            columns: columns
        };
        this.tables.push(tblRec);
        this.tblMap[tblRec.lookup] = tblRec;

        columns = columns || [];

        // add the columns that are associated with this table.
        columns.forEach(c => {
            const colRec = {
                name: c,
                lookup: c.toLowerCase(),
                table: name
            };

            let colList = this.colMap[colRec.lookup];
            if (colList) {
                colList.push(colRec);
            } else {
                // add as a list since multiple columns can have the
                // same name...
                this.colMap[colRec.lookup] = [colRec];
            }
        });
    }

    getAllScopes() {
        let ancestors = [];

        for (let p = this; p; p = p.parent) {
            ancestors.push(p);
        }

        return ancestors;
    }

    visibleTables() {
        return this.getAllScopes()
            .reverse()
            .reduce((prev, p) => Object.assign(prev, p.lookup), {});
    }

    // Returns true if the given table is in this or a parent scope.
    isTableInScope(name) {
        let lowerName = name.toLowerCase();

        if (this.tables.find(v => v.name.toLowerCase() === lowerName)) {
            return true;
        }

        return this.parent ? this.parent.isTableInScope(name) : false;
    }

    // Returns a name given a table name or alias (or null if not found).
    resolveTable(name, searchParent) {
        let entry = this.tblMap[name.toLowerCase()];

        if (entry) {
            return entry;
        }
        return this.parent && searchParent !== false ? this.parent.resolveTable(name) : null;
    }

    getColumns(searchParent) {
        let result = [];

        this.tables.forEach(t => [].push.apply(result, t.columns));

        if (this.parent && searchParent !== false) {
            result = result.concat(this.parent.getColumns());
        }

        return result;
    }

    findColName(lowerName, name) {
        let result;

        this.tables.find(t => {
            result = t.columns.find(c => c.toLowerCase() === lowerName);
            return result;
        });

        if (result) {
            return result;
        }
        if (this.parent) {
            return this.parent.findColName(lowerName, name);
        }
        // last effort...
        if (["sysdate", "rownum"].indexOf(lowerName) !== -1) {
            return name;
        }
        return null;
    }

    // given a column identifier, finds the table it belongs to and
    // the correct name of the column.
    resolveColumn(name, searchParent) {
        let colName, tableRef;

        // separate the table reference, if present.
        // Allow '.' in table name in case the table reference is like:
        // INFORMATION_SCHEMA.COLUMNS....
        let match = /^(?:([._a-zA-Z0-9]+)\.)?((?:\[?[_a-zA-Z0-9]+\]?)|\*)$/.exec(name);

        if (!match) {
            console.log("   SQL Parser: failed to parse column name");
            return null;
        }

        [, tableRef, colName] = match;

        colName = colName.replace(/[\[\]]/g, "");

        // If there is a table reference then lookup the table using that
        // name to identify the column.

        if (tableRef) {
            let tableResult = this.resolveTable(tableRef, searchParent);

            if (tableResult) {
                if (colName === "*") {
                    const cols = tableResult.columns;
                    return cols.length > 0 ? cols : null;
                }

                let col = tableResult.columns.find(c => c.toLowerCase() === colName.toLowerCase());

                if (col) {
                    return `${tableResult.ref}.${col}`;
                }
            }

            // check for common oracle constructs ...
            if (colName.toLowerCase() === "nextval") {
                // return the whole thing...
                return name;
            }

            return null;
        }

        if (colName === "*") {
            const cols = this.getColumns(searchParent);
            return cols.length > 0 ? cols : null;
        }

        // try to resolve column against all tables in scope...
        return this.findColName(colName.toLowerCase(), colName);
    }
}

const getColumnsFromSelect = (scope, node) => {
    let cols = [];

    if (node.type === "statement") {
        if (node.variant === "compound") {
            cols = getColumnsFromSelect(scope, node.statement);
        } else if (node.variant === "select") {
            node.result.forEach(r => {
                if (r.type === "statement" && r.variant === "select") {
                    // sub-select in this position must have alias...
                    cols.push(r.alias);
                } else if (r.type === "identifier") {
                    // should have a name...
                    const col = scope.resolveColumn(r.name, false);

                    // this may return a single column or if *, may return an array of columns.
                    if (_.isArray(col) && col.length > 0) {
                        cols = cols.concat(col);
                    } else if (col) {
                        cols.push(col);
                    } else {
                        console.log(`   SQL Parser: ${r.name} didn't resolve to any column(s)`);
                    }
                } else if (r.alias) {
                    // whatever this is is okay if it has an alias.
                    cols.push(r.alias);
                } else {
                    console.log("   SQL Parser: Found something else: ", JSON.stringify(r));
                }
            });
        }
    }

    // console.log(JSON.stringify(cols));
    return cols;
};

const isTableOrColumn = n =>
    n.type === "identifier" && (n.variant === "table" || n.variant === "column");

module.exports = function fix(q, verbose) {
    let tree = parser(q);

    let subSelectIndex = 1;
    let scope = null;
    const nodeStack = [];

    let warnings = [];

    const editList = new Edits(q);

    const replaceNodeText = (node, newStr) => {
        editList.replace(node.loc.start.offset, node.loc.end.offset, newStr);
    };

    const isNestedSourceSelect = n => {
        if (nodeStack.length) {
            const pNode = nodeStack[nodeStack.length - 1];

            return (
                (pNode.type === "statement" &&
                    pNode.variant === "select" &&
                    pNode.from &&
                    pNode.from === n) ||
                pNode.type === "map" ||
                pNode.type === "join" ||
                pNode.type === "compound" ||
                (pNode.type === "statement" && pNode.variant === "compound") ||
                (pNode.type === "statement" &&
                    pNode.variant === "select" &&
                    n.type === "statement" &&
                    n.variant === "compound")
            );
        }
        return false;
    };

    const leave = n => {
        if (n) {
            // console.log(` <= ${n.type} ${n.variant}`);

            // console.log(`Exiting ${n.type} ${n.variant}`);

            if (n.type === "statement" && n.variant !== "list") {
                if (isNestedSourceSelect(n)) {
                    if (scope.parent) {
                        const hoistCols = getColumnsFromSelect(scope, n);
                        let alias = n.alias;

                        // compound statements don't need an alias...
                        if (!alias) {
                            alias = `<anon${subSelectIndex}>`;
                        }

                        if (hoistCols.length > 0) {
                            scope.parent.addTable(
                                `<subselect${subSelectIndex++}>`,
                                alias,
                                hoistCols
                            );
                        }
                    }
                }

                if (n.order && n.order.length > 0) {
                    // order by clause can reference aliases from the selected
                    // columns in sql server ... post-process the columns to
                    // make sure they are all resolved correctly.
                    const selectedCols = getColumnsFromSelect(scope, n);

                    if (selectedCols && selectedCols.length > 0) {
                        scope.addTable("<top>", "", selectedCols);
                        walk(visit, n.order, "", nextChildren);
                    }
                }

                scope = scope ? scope.parent : null;
            }
        }
    };

    const visit = (n, lbl) => {
        if (n === null) {
            return leave(nodeStack.pop());
        }

        // console.log(` => ${n.type} ${n.variant} ${lbl}`);

        if (isTableOrColumn(n)) {
            if (n.variant === "table") {
                const tblName = getTableName(n.name);

                if (tblName !== null && tblName !== n.name) {
                    // console.log(`-----------------------------------------`);
                    // console.log(`> ${n.name} should be ${tblName}`);
                    replaceNodeText(n, tblName);
                    // console.log(`-----------------------------------------`);
                } else if (tblName === null) {
                    warnings.push("Unknown table: " + n.name);
                }

                scope.addTable(n.name, n.alias, getTableCols(n.name));
            } else if (n.variant === "column") {
                // we should be able to find a column that is in scope.

                // console.log(`Try to find column: ${n.name}`);

                const colName = scope.resolveColumn(n.name);

                if (colName !== null && colName !== n.name) {
                    // console.log(  `> ${n.name} should be ${JSON.stringify(colName)}` );
                    replaceNodeText(n, colName);
                } else if (colName === null) {
                    warnings.push("Unknown column: " + n.name);
                }
            }
            return;
        }

        if (n.type === "statement" && n.variant !== "list") {
            scope = new Scope(scope);
        }

        nodeStack.push(n);
        return visit;
    };

    walk(visit, tree, "", nextChildren);

    if (verbose) {
        console.log(JSON.stringify(tree, null, 2));
    }

    return { result: editList.apply(), warnings: warnings };
};

var getTableName = tbl => {
    let entry = schema.tables[tbl.toLowerCase()];
    return entry ? entry.name : null;
};

var getTableCols = tbl => {
    let entry = schema.tables[tbl.toLowerCase()];
    return entry ? Object.values(entry.cols) : [];
};
