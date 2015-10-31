// todo? the groupvalue function could access subfields of the dimension value?
dcplot.group = {
    identity: function(dim) { return dim.group(); },
    bin: function(binwidth) {
        var f = function(dim) {
            return dim.group(
                function(x) {
                    return Math.floor(x/binwidth)*binwidth;
                });
        };
        f.binwidth = binwidth;
        return f;
    }
};

// yes! these are fourth-order functions!
// the methods on this object take an access-thing and return an object for accessor()
// accessor() will bind access to a real accessor function
// that function is ready to take a group
// and pass it the functions it composes to call the true accessor
dcplot.reduce = {
    count: function(group) { return group.reduceCount(); },
    countFilter: function(access, level) {
        return dcplot.reduce.sum(function (a) {
            return (access(a) === level) ? 1 : 0;
        });
    },
    filter: function(reduce, access, level) {
        function wrapper(acc) {
            return function (a) {
                return (access(a) === level) ? acc(a) : 0;
            };
        }
        return {
            arg: reduce.arg,
            fun: function(acc) { return reduce.fun(wrapper(acc)); }
        };
    },
    sum: function(access, wacc) {
        return {
            arg: access,
            fun: function(acc2) {
                if(wacc === undefined)
                    return function(group) {
                        return group.reduceSum(
                            function(item) {
                                return acc2(item);
                            }
                        );
                    };
                else return function(group) {
                    return group.reduce(
                        function(p, v) {
                            p.sum += (acc2(v)*wacc(v));
                            return p;
                        },
                        function(p, v) {
                            p.sum -= (acc2(v)*wacc(v));
                            return p;
                        },
                        function(p, v) {
                            return {sum: 0, valueOf: function() { return this.sum; }};
                        });
                };
            }
        };
    },
    any: function(access) {
        return {
            arg: access,
            fun: function(acc2) {
                return function(group) {
                    return group.reduce(
                        function(p, v) {
                            return acc2(v);
                        },
                        function(p, v) {
                            return p;
                        },
                        function(p, v) {
                            return 0;
                        });
                };
            }
        };
    },
    avg: function(access, wacc) {
        return {
            arg: access,
            fun: function(acc2) {
                if(wacc === undefined) return function(group) {
                    return group.reduce(
                        function(p, v) {
                            ++p.count;
                            p.sum += acc2(v);
                            p.avg = p.sum / p.count;
                            return p;
                        },
                        function(p, v) {
                            --p.count;
                            p.sum -= acc2(v);
                            p.avg = p.count ? p.sum / p.count : 0;
                            return p;
                        },
                        function(p, v) {
                            return {count: 0, sum: 0, avg: 0, valueOf: function() { return this.avg; }};
                        });
                };
                else return function(group) {
                    return group.reduce(
                        function(p, v) {
                            p.count += wacc(v);
                            p.sum += (acc2(v)*wacc(v));
                            p.avg = p.sum / p.count;
                            return p;
                        },
                        function(p, v) {
                            p.count -= wacc(v);
                            p.sum -= (acc2(v)*wacc(v));
                            p.avg = p.count ? p.sum / p.count : 0;
                            return p;
                        },
                        function(p, v) {
                            return {count: 0, sum: 0, avg: 0, valueOf: function() { return this.avg; }};
                        });
                };
            }
        };
    },
    value: function(field) {
        return function(key, value) {
            return value[field];
        };
    }
};
