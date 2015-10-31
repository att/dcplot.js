// Expose d3 and crossfilter, so that clients in browserify
// case can obtain them if they need them.
dcplot.dc = dc;
dcplot.crossfilter = crossfilter;

return dcplot;}
    if(typeof define === "function" && define.amd) {
        define(["dc", "crossfilter"], _dcplot);
    } else if(typeof module === "object" && module.exports) {
        var _dc = require('dc');
        var _crossfilter = require('crossfilter');
        // When using npm + browserify, 'crossfilter' is a function,
        // since package.json specifies index.js as main function, and it
        // does special handling. When using bower + browserify,
        // there's no main in bower.json (in fact, there's no bower.json),
        // so we need to fix it.
        if (typeof _crossfilter !== "function") {
            _crossfilter = _crossfilter.crossfilter;
        }
        module.exports = _dcplot(_dc, _crossfilter);
    } else {
        this.dc = _dc(dc, crossfilter);
    }
}
)();
