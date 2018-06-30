const assert = require("assert"),
    _ = require("lodash");

class StaticLiteral {
    constructor(node) {
        assert.strictEqual(typeof node.value, "string");

        this.value = node.value;

        // Save the position of the text portion of the literal token:
        // The token's range includes the opening quote and the closing quote, but
        // the end position is the index of the closing quote.
        // Store the position after the opening quote to the ending quote.
        this.pos = [node.range[0] + 1, node.range[1]];
    }

    replace(newValue) {
        if (newValue !== this.value) {
            return [{ start: this.pos[0], end: this.pos[1], value: newValue }];
        }
        return [];
    }

    asSpans() {
        return [new StaticSpan(this.value, this.pos[0])];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

class StaticEmptyStr {
    constructor(v) {
        this.value = v || "";
    }

    replace(newValue) {
        return [];
    }

    asSpans() {
        return [new StaticSpan(this.value, null)];
    }

    plus(other) {
        // just replace...
        return other;
    }
}

class StaticDTreeTbl {
    constructor() {
        this.value = "[DTreeCore]";
    }

    replace() {
        return [];
    }

    asSpans() {
        return [new StaticSpan(this.value, null)];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

// a more efficient alternative to StaticChar -- spans of adjacent characters with
// a common replacement strategy.

class StaticSpan {
    constructor(val, p) {
        this.value = val;
        this.p = p;
    }

    subspan(start, end) {
        if (start <= 0 && end >= this.value.length) {
            return this;
        }
        let newPos = this.p === null ? null : this.p + start;
        return new StaticSpan(this.value.substring(start, end), newPos);
    }

    replace(newVal) {
        if (this.p !== null && newVal !== this.value) {
            return [{ start: this.p, end: this.p + newVal.length, value: newVal }];
        }
        return [];
    }

    asSpans() {
        return [this];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

class StaticSubstr {
    // start and end are start and end indexes into the catenation of the staticOrArray.
    constructor(staticOrArray, start, end) {
        if (start >= end) {
            this.array = [];
            this.value = "";
            return;
        }

        if (!_.isArray(staticOrArray)) {
            staticOrArray = staticOrArray.asSpans();
        }

        let spans = [],
            val = "";
        let index = 0;

        for (let span of staticOrArray) {
            let spanStart = index,
                spanLen = span.value.length,
                spanEnd = index + spanLen;

            index += spanLen;

            if (spanStart >= end) break;
            if (spanEnd <= start) continue;

            const realStart = Math.max(spanStart, start) - spanStart;
            const realEnd = Math.min(spanEnd, end) - spanStart;

            // need to trim front and/or back.
            spans.push(span.subspan(realStart, realEnd));
        }

        // split into array...
        this.array = spans;
        this.value = this.array.map(v => v.value).join("");
    }

    replace(newValue) {
        let rtn = [];

        // sanity check.
        assert.strictEqual(newValue.length, this.value.length);

        let index = 0;

        this.array.forEach(span => {
            const spanLen = span.value.length;
            const replacements = span.replace(newValue.substring(index, index + spanLen));
            index += spanLen;
            [].push.apply(rtn, replacements);
        });

        return rtn;
    }

    asSpans() {
        return this.array;
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

class StaticChar {
    constructor(c, p) {
        this.value = c;
        this.p = p;
    }
    replace(newCh) {
        if (this.p !== null && newCh !== this.value) {
            return [{ start: this.p, end: this.p + 1, value: newCh }];
        }
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
            throw new Error("Bad left value: " + JSON.stringify(this.left.value));
        }
        if (typeof rval !== "string") {
            throw new Error("Bad right value: " + JSON.stringify(this.right.value));
        }

        return lval + rval;
    }

    asSpans() {
        return [...this.left.asSpans(), ...this.right.asSpans()];
    }

    // Returns the edits needed to replace a composite value.
    // Assuming case-changes only, so newValue should be the same
    // length as the composite value.
    replace(newValue) {
        const mid = this.left.value.length;

        const leftReplace = this.left.replace(newValue.substring(0, mid));
        const rightReplace = this.right.replace(newValue.substring(mid));

        const leftDiff = leftReplace !== this.left.value;
        const rightDiff = rightReplace !== this.right.value;

        if (leftDiff && rightDiff) return [...leftReplace, ...rightReplace];
        if (leftDiff) return leftReplace;
        if (rightDiff) return rightReplace;

        return [];
    }

    plus(other) {
        return new StaticConcat(this, other);
    }
}

module.exports = {
    StaticEmptyStr,
    StaticConcat,
    StaticDTreeTbl,
    StaticLiteral,
    StaticSubstr,
    StaticChar
};
