const _ = require("lodash");

var getNode = n => (_.isArray(n) && n.length >= 1 ? n[0] : n);

var getNodeProp = (n, ...props) => {
    let cur = n;
    for (let p of props) {
        if (!cur || !cur.hasOwnProperty(p)) {
            return null;
        }
        cur = getNode(cur[p]);
    }
    return cur;
};

module.exports = { getNode, getNodeProp };
