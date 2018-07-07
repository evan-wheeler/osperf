"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ExecInfo {
    constructor(node) {
        this.node = node;
        this.statements = [];
    }
    addGood(stmt) {
        this.statements.push({ stmt: stmt.value, spans: stmt.asSpans(), warnings: [], err: "" });
    }
    addWarning(stmt, warnings) {
        this.statements.push({ stmt: stmt.value, spans: stmt.asSpans(), warnings, err: "" });
    }
    addError(stmt, err) {
        this.statements.push({ stmt: stmt.value, spans: stmt.asSpans(), err, warnings: [] });
    }
}
class FileReport {
    constructor(curFile) {
        this.curFile = curFile;
        this.execs = [];
    }
    curExec() {
        return this.execs[this.execs.length - 1];
    }
    newExec(node) {
        this.execs.push(new ExecInfo(node));
    }
    format() { }
}
exports.FileReport = FileReport;
