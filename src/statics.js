class StaticLiteral {
    constructor(node) {
        if (typeof node.value !== "string") {
            throw new error({
                message: "Bad static literal",
                object: JSON.stringify(node.value)
            });
        }

        this.value = node.value;
        this.pos = node.range;
    }

    replace(newValue) {
        // literal positions include the quotes, so take that into consideration
        // when replacing the contents.
        return [{ start: this.pos[0] + 1, end: this.pos[1], value: newValue }];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

class StaticEmptyStr {
    constructor() {}
    get value() {
        return "";
    }
    replace(newValue) {
        return [];
    }

    plus(other) {
        // just replace...
        return other;
    }
}

class StaticDTreeTbl {
    constructor() {}

    get value() {
        return "[DTreeCore]";
    }

    replace(newValue) {
        return [];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

class StaticConcat {
    constructor(left, right) {
        this.left = left;
        this.right = right;
    }

    get value() {
        const lval = this.left.value;
        const rval = this.right.value;

        if (typeof lval !== "string") {
            throw new error({
                message: "Bad left value: ",
                object: JSON.stringify(this.left.value)
            });
        }
        if (typeof rval !== "string") {
            throw new error({
                message: "Bad right value: ",
                object: JSON.stringify(this.right.value)
            });
        }

        return lval + rval;
    }

    // Returns the edits needed to replace a composite value.
    // Assuming case-changes only, so newValue should be the same
    // length as the composite value.
    replace(newValue) {
        const mid = this.left.value.length;

        const leftReplace = this.left.replace(newValue.substring(0, mid));
        const rightReplace = this.right.replace(newValue.substring(mid));

        return [...leftReplace, ...rightReplace];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

module.exports = {
    StaticEmptyStr,
    StaticConcat,
    StaticDTreeTbl,
    StaticLiteral
};
