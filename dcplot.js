/*!
 *  dcplot.js 0.4.1
 *  http://att.github.io/dcplot.js/
 *  Copyright (c) 2012-2013 AT&T Intellectual Property
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
(function() { function _dcplot(dc, crossfilter, _) {
'use strict';

/* global dcplot, _ */
dcplot.version = '0.4.1';

// dc.js formats all numbers as ints - override
var _psv = dc.utils.printSingleValue;
dc.utils.printSingleValue = function(filter) {
    if(typeof(filter) === 'number') {
        if(filter%1 === 0)
            return filter;
        else if(filter>10000 || filter < -10000)
            return Math.round(filter);
        else
            return filter.toPrecision(4);
    }
    else return _psv(filter);
};

dcplot.format_error = function(e) {
    var d3 = dc.d3;
    var error_report = d3.select(document.createElement('div'))
            .append('p').text('dcplot errors!');
    if(_.isArray(e)) { // expected exception: input error
        var tab = error_report.append('table');
        var tr = tab.selectAll('tr')
                .data(e).enter().append('tr')
                .attr('valign', 'top');
        tr
            .append('td')
            .text(function(d) {
                return d.type;
            });
        tr
            .append('td').text(function(d) {
                return d.name.replace(/_\d*_\d*$/, '');
            });
        var tderr = tr.append('td');
        tderr
            .selectAll('p').data(function(d) {
                return _.isArray(d.errors) ? d.errors : d.errors.toString();
            }).enter().append('p')
            .text(function(d) {
                return d;
            });
    }
    else // unexpected exception: probably logic error
        error_report.append('p').text(e.toString());
    return error_report.node();
};


// generalization of _.has
dcplot.mhas = function(obj) {
    for(var i=1; i<arguments.length; ++i)
        if(!_.has(obj, arguments[i]) || obj[arguments[i]] === undefined)
            return false;
    else obj = obj[arguments[i]];
    return true;
};

dcplot.looks_ordinal = function(frame, dims, dim) {
    return _.has(dims, dim) && _.isString(dcplot.accessor(frame, dims[dim])(0));
};

dcplot.accessor = function(frame, a) {
    function constant_fn(v) {
        return function() { return v; };
    }
    if(_.isFunction(a))
        return a;
    else if(_.isString(a))
        return frame.has(a) ? frame.access(a) : constant_fn(a);
    else if(_.isObject(a)) {
        if(('fun' in a) && ('arg' in a)) {
            var fun = a.fun, arg = a.arg;
            var resolve = dcplot.accessor(frame, arg);
            return fun(resolve);
        }
        else return constant_fn(a);
    }
    else if(_.isNumber(a))
        return constant_fn(a);
    else throw 'illegal accessor ' + a.toString();
};

// abstract this into a plugin - this is RCloud-specific (rserve.js)
dcplot.get_levels = function(frame, dims, dim) {
    var levels = null;
    if(_.isFunction(dim)) levels = dim.attrs.r_attributes.levels;
    else if(_.has(dims, dim) && dcplot.mhas(dcplot.accessor(frame, dims[dim]), 'attrs', 'r_attributes', 'levels'))
        levels = dcplot.accessor(frame, dims[dim]).attrs.r_attributes.levels;
    return levels;
};

dcplot.find_unused = function(hash, base) {
    if(!hash[base])
        return base;
    var n = 1;
    while(hash[base + n]) ++n;
    return base + n;
};

/* global dcplot */
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

/* global dcplot, _ */
/* exported dcplot */
/*
 many stages of filling in the blanks for dimensions, groups, and charts

 1. fill in defaults for missing attributes
 2. infer other missing attributes from what's there
 3. check for required and unknown attributes
 4. check for logical errors
 5. finally, generate

 */


function skip_attr(a) {
    return a==='supported' || a==='concrete' || a==='parents';
}

function parents_first_traversal(map, iter, callback) {
    if(!(iter in map))
        throw 'unknown chart type ' + iter;
    var rest = Array.prototype.slice.call(arguments, 3);
    var curr = map[iter];
    if('parents' in curr)
        for(var i = 0; i < curr.parents.length; ++i)
            parents_first_traversal.apply(null, [map, curr.parents[i], callback].concat(rest));
    if(curr[callback])
        curr[callback].apply(curr, rest);
}

/*
function parents_last_traversal(map, iter, callback) {
    if(!(iter in map))
        throw 'unknown chart type ' + iter;
    var rest = Array.prototype.slice.call(arguments, 3);
    var curr = map[iter];
    if(curr[callback])
        curr[callback].apply(curr, rest);
    if('parents' in curr)
        for(var i = 0; i < curr.parents.length; ++i)
            parents_last_traversal.apply(null, [map, curr.parents[i], callback].concat(rest));
}
*/

// defaults
dcplot.default_definition = function(definition) {
    // defaults on the definition as a whole
    if(!definition.defreduce)
        definition.defreduce = dcplot.reduce.count;
};

dcplot.default_dimension = function(definition, name, defn) {
    // nothing (yet?)
};

dcplot.default_group = function(definition, name, defn, dims) {
    var errors = [];
    if(!_.has(defn, 'group'))
        defn.group = dcplot.group.identity;
    if(!_.has(defn, 'reduce'))
        defn.reduce = definition.defreduce;

    if(errors.length)
        throw errors;
};

// inferences
dcplot.infer_dimension = function(definition, name, defn) {
    // nothing (yet?)
};

dcplot.infer_group = function(definition, name, defn, dims) {
};

// check missing attrs
dcplot.check_dimension_attrs = function(definition, name, defn) {
};

dcplot.check_group_attrs = function(definition, name, defn) {
    var expected = ['dimension', 'group', 'reduce'];
    var k = _.keys(defn),
        missing = _.difference(expected, k),
        unknown = _.difference(k, expected),
        errors = [];
    if(missing.length)
        errors.push('definition is missing required attrs: ' + missing.join(', '));
    if(unknown.length)
        errors.push('definition has unknown attrs: ' + unknown.join(', '));

    if(errors.length)
        throw errors;
};

// check logic errors
dcplot.check_dimension_logic = function(definition, name, defn) {
    // nothing (yet?)
};

dcplot.check_group_logic = function(definition, name, defn, dims) {
    var errors = [];
    if(!_.has(dims, defn.dimension))
        errors.push('unknown dimension "' + defn.dimension + '"');

    if(errors.length)
        throw errors;
};

/* create uniformity between crossfilter dimension and reduce functions,
 and dc.js accessor functions with a simple trick: for the latter,
 split the input, which is {key, value}, into two params. this works
 because crossfilter functions work with just the 'key'

 i.e. in crossfilter:
 * dimension functions are key -> key
 * group.group functions are key -> key
 * group.reduce functions are key -> value
 in dc:
 * accessor functions are {key,value} -> whatever

 so instead we make them (key,value) -> whatever and then they look like
 crossfilter functions!
 */
dcplot.key_value = function(f) { return function(kv) { return f(kv.key, kv.value); }; };


function dcplot(frame, groupname, definition, chart_program) {
    chart_program = chart_program || dcplot.dc_chart_program;

    function default_chart(definition, name, defn, dims, groups) {
        // exclusively from chart_attrs
        function do_defaults(defn, type) {
            var cprog = chart_program[type];
            if(!cprog.supported)
                throw 'chart type ' + type + ' not supported';
            var cattrs = cprog.attributes;
            for(var a in cattrs) {
                if(skip_attr(a))
                    continue;
                if(_.has(cattrs[a], 'default') && defn[a]===undefined)
                    defn[a] = cattrs[a].default;
            }
            // parents last
            if('parents' in cprog)
                for(var i = 0; i < cprog.parents.length; ++i)
                    do_defaults(defn, cprog.parents[i]);

        }
        do_defaults(defn, defn.type);
    }

    function infer_chart(definition, name, defn, dims, groups) {
        var errors = [];
        parents_first_traversal(chart_program, defn.type, 'infer',
                                definition, name, frame, defn, dims, groups, errors);
        if(errors.length)
            throw errors;
    }

    function check_chart_attrs(definition, name, defn) {
        function find_discreps(defn, type, missing, found) {
            var cprog = chart_program[type];
            if(!cprog.supported)
                throw 'type "' + type + '" not supported';
            var cattrs = cprog.attributes;
            if('parents' in cprog)
                for(var i = 0; i < cprog.parents.length; ++i)
                    find_discreps(defn, cprog.parents[i], missing, found);
            for(var a in cattrs) {
                if(skip_attr(a))
                    continue;
                if(cattrs[a].required && defn[a]===undefined)
                    missing.push(a);
                if(_.has(found, a))
                    found[a] = true;
            }
        }
        function empty_found_map(defn) {
            var k = _.without(_.keys(defn), 'type'), n = k.length, v = [];
            while(n--) v.push(false);
            return _.object(k,v);
        }
        var missing = [], found = empty_found_map(defn);
        find_discreps(defn, defn.type, missing, found);

        var errors = [];
        if(missing.length)
            errors.push('definition is missing required attrs: ' + missing.join(', '));
        var unknown = _.map(_.reject(_.pairs(found),
                                     function(p) { return p[1]; }),
                            function(p) { return p[0]; });
        if(unknown.length)
            errors.push('definition has unknown attrs: ' + unknown.join(', '));

        if(errors.length)
            throw errors;
    }


    function check_chart_logic(definition, name, defn, dims, groups) {
        var errors = [];
        parents_first_traversal(chart_program, defn.type, 'check_logic',
                                definition, defn, dims, groups, errors);
        if(errors.length)
            throw errors;
    }

    function create_group(defn, dimensions) {
        return dcplot.accessor(frame, defn.reduce)(defn.group(dimensions[defn.dimension]));
    }

    function create_chart(groupname, defn, dims, groups) {
        var object = {};
        parents_first_traversal(chart_program, defn.type, 'create',
                                definition, object, groupname, frame, defn, dims, groups, errors);

        // perform any extra post-processing
        if(_.has(defn, 'more'))
            defn.more(object.chart);

        return object.chart;
    }

    function aggregate_errors(dimension_fn, group_fn, chart_fn) {
        var errors = [];
        for(var d in definition.dimensions) {
            defn = definition.dimensions[d];
            try {
                dimension_fn(definition, d, defn);
            }
            catch(e) {
                errors.push({type: 'dimension', name: d, errors: e});
            }
        }
        if(!_.has(definition, 'groups'))
            definition.groups = {};
        for(var g in definition.groups) {
            defn = definition.groups[g];
            try {
                group_fn(definition, g, defn, definition.dimensions);
            }
            catch(e) {
                errors.push({type: 'group', name: g, errors: e});
            }
        }
        for(var c in definition.charts) {
            defn = definition.charts[c];
            try {
                chart_fn(definition, c, defn, definition.dimensions, definition.groups);
            }
            catch(e) {
                errors.push({type: 'chart', name: c, errors: e});
            }
        }
        return errors;
    }

    var errors = [];
    var defn;

    // first check all chart types because the traversals are unchecked
    for(var c in definition.charts) {
        defn = definition.charts[c];
        if(!(defn.type in chart_program))
            throw 'unknown chart type "' + defn.type + '"';
        if(!chart_program[defn.type].supported)
            throw 'unsupported chart type "' + defn.type + '"';
        if(!chart_program[defn.type].concrete)
            throw 'can\'t create abstract chart type "' + defn.type + '"';
    }

    // fill in anything easily defaultable (will not happen in incremental mode)
    // [but are there things we only want to default after inference?]
    dcplot.default_definition(definition);
    errors = aggregate_errors(dcplot.default_dimension, dcplot.default_group, default_chart);
    if(errors.length)
        throw errors;

    // infer attributes from other attributes
    errors = aggregate_errors(dcplot.infer_dimension, dcplot.infer_group, infer_chart);
    if(errors.length)
        throw errors;

    // check for missing or unknown attrs
    errors = aggregate_errors(dcplot.check_dimension_attrs, dcplot.check_group_attrs, check_chart_attrs);
    if(errors.length)
        throw errors;

    // check for inconsistencies and other specific badness
    errors = aggregate_errors(dcplot.check_dimension_logic, dcplot.check_group_logic, check_chart_logic);
    if(errors.length)
        throw errors;

    console.log('dcplot charts definition:');
    console.log(definition);

    // create / fill stuff in
    var dimensions = {};
    var groups = {};
    var charts = {};

    var ndx = crossfilter(frame.records());
    for(var d in definition.dimensions) {
        defn = definition.dimensions[d];
        dimensions[d] = ndx.dimension(dcplot.accessor(frame, defn));
    }
    for(var g in definition.groups) {
        defn = definition.groups[g];
        groups[g] = create_group(defn, dimensions);
    }

    for(c in definition.charts) {
        defn = definition.charts[c];
        charts[c] = create_chart(groupname, defn, dimensions, groups);
    }

    dc.renderAll(groupname);

    return {dataframe: frame, crossfilter: ndx,
            dimensions: dimensions, groups: groups, charts: charts};
}

/* global dcplot, _ */
// warning: don't put method calls for defaults which must be constructed each time!
dcplot.dc_chart_program = {
    base: {
        supported: true,
        attributes: {
            div: {required: true}, // actually sent to parent selector for chart constructor
            title: {required: false}, // title for html in the div, handled outside this lib
            dimension: {required: true},
            group: {required: true},
            ordering: {required: false},
            width: {required: true, default: 300},
            height: {required: true, default: 300},
            'transition.duration': {required: false},
            label: {required: false}, // or null for no labels
            tips: {required: false}, // dc 'title', or null for no tips
            more: {required: false} // executes arbitrary extra code on the dc.js chart object
            // key, value are terrible names: handle as variables below
        },
        ctors: {
            pie: dc.pieChart,
            bar: dc.barChart,
            line: dc.lineChart,
            bubble: dc.bubbleChart,
            dataTable: dc.dataTable
        },
        infer: function(definition, name, frame, defn, dims, groups, errors) {
            if(!('div' in defn))
                defn.div = '#' + name;
            if(defn.group) {
                if(!groups[defn.group])
                    errors.push('unknown group "' + defn.group + '"');
                else if(!defn.dimension)
                    defn.dimension = groups[defn.group].dimension;
            }
            else if(defn.dimension) {
                if(!dims[defn.dimension])
                    errors.push('unknown dimension "' + defn.dimension + '"');
                else {
                    defn.group = dcplot.find_unused(groups, defn.dimension);
                    var g = groups[defn.group] = {};
                    g.dimension = defn.dimension;
                    dcplot.default_group(definition, defn.group, g, dims);
                    dcplot.infer_group(definition, defn.group, g, dims);
                }
            }
            if(!_.has(defn, 'ordering')) {
                // note it's a little messy to have this as a property of the chart rather than
                // the group, but dc.js sometimes needs an ordering and sometimes doesn't
                var levels = dcplot.get_levels(frame, dims, defn.dimension);
                if(levels !== null) {
                    var rmap = _.object(levels, _.range(levels.length));
                    // the ordering function uses a reverse map of the levels
                    defn.ordering = function(p) {
                        return rmap[p.key];
                    };
                }
            }
        },
        check_logic: function(definition, defn, dims, groups, errors) {
            if(defn.dimension && defn.dimension!==groups[defn.group].dimension)
                errors.push('group "' + defn.group + '" dimension "' + groups[defn.group].dimension +
                            '" does not match chart dimension "' + defn.dimension + '"');
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            var ctor = this.ctors[defn.type];
            var chart = ctor(defn.div, groupname);
            chart.dimension(dims[defn.dimension])
                .group(groups[defn.group])
                .width(defn.width)
                .height(defn.height);
            if(_.has(defn, 'ordering'))
                chart.ordering(defn.ordering);
            if(_.has(defn, 'transition.duration'))
                chart.transitionDuration(defn['transition.duration']);
            if(_.has(defn, 'label')) {
                if(defn.label)
                    chart.label(dcplot.key_value(defn.label));
                else
                    chart.renderLabel(false);
            }
            if(_.has(defn, 'tips')) {
                if(defn.tips)
                    chart.title(dcplot.key_value(defn.tips));
                else
                    chart.renderTitle(false);
            }
            object.chart = chart;
        }
    },
    color: {
        supported: true,
        attributes: {
            color: {required: false}, // colorAccessor
            'color.scale': {required: false}, // the d3 way not the dc way
            'color.domain': {required: false},
            'color.range': {required: false}
        },
        infer: function(definition, name, frame, defn, dims, groups, errors) {
            if(!defn['color.scale']) {
                // note stackable bleeds in here: since they are on different branches
                // of the hierarchy, there is no sensible way for stackable to override
                // color here
                var levels = dcplot.get_levels(frame, dims, defn.stack || defn.dimension);
                defn['color.scale'] = (levels !== null && levels.length>10) ?
                    d3.scale.category20() : d3.scale.category10();
            }
            if(!defn['color.domain']) {
                // this also should be abstracted out into a plugin (RCloud-specific)
                if(dcplot.mhas(defn, 'color', 'attrs', 'r_attributes', 'levels'))
                    defn['color.domain'] = defn.color.attrs.r_attributes.levels;
            }
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'color'))
                object.chart.colorAccessor(dcplot.key_value(dcplot.accessor(frame, defn.color)));

            var scale = defn['color.scale'];
            if(_.has(defn, 'color.domain'))
                scale.domain(defn['color.domain']);
            if(_.has(defn, 'color.range'))
                scale.range(defn['color.range']);
            object.chart.colors(scale);
        }
    },
    stackable: {
        supported: true,
        attributes: {
            stack: {required: false},
            'stack.levels': {required: false}
        },
        infer: function(definition, name, frame, defn, dims, groups, errors) {
            if(_.has(defn,'stack')) {
                if(!_.has(defn,'stack.levels'))
                    defn['stack.levels'] = dcplot.get_levels(frame, dims, defn.stack);
                var levels = defn['stack.levels'];

                // Change reduce functions to filter on stack levels
                for(var s = 0; s<levels.length; s++) {
                    var newName = defn.group+levels[s];
                    var newGroupDefn = _.clone(groups[defn.group]);

                    // Special treatment for counts, otherwise generic filter wrapper
                    if(newGroupDefn.reduce === dcplot.reduce.count)
                        newGroupDefn.reduce = dcplot.reduce.countFilter(defn.stack,levels[s]);
                    else newGroupDefn.reduce = dcplot.reduce.filter(newGroupDefn.reduce,defn.stack,defn['stack.levels'][s]);

                    groups[newName] = newGroupDefn;
                }
            }
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'stack') && _.has(defn, 'stack.levels')) {
                for(var s = 0; s<defn['stack.levels'].length; s++) {
                    var stackGroup = groups[defn.group+defn['stack.levels'][s]];

                    if(s === 0)
                        object.chart.group(stackGroup);
                    else object.chart.stack(stackGroup);
                }
            }
        }
    },
    coordinateGrid: {
        supported: true,
        parents: ['base', 'color'],
        attributes: {
            margins: {required: false},
            x: {required: false}, // keyAccessor
            y: {required: false}, // valueAccessor
            // prob would be good to subgroup these?
            'x.ordinal': {required: false},
            'x.scale': {required: true}, // scale component of x
            'x.domain': {required: false}, // domain component of x
            'x.units': {required: false}, // the most horrible thing EVER
            'x.round': {required: false},
            'x.elastic': {required: false},
            'x.padding': {required: false},
            'x.label': {required: false},
            // likewise
            'y.scale': {required: false},
            'y.domain': {required: false},
            'y.elastic': {required: false},
            'y.padding': {required: false},
            'y.label': {required: false},
            gridLines: {required: false}, // horizontal and/or vertical
            brush: {required: false}
            // etc...
        },
        infer: function(definition, name, frame, defn, dims, groups, errors) {
            var levels = dcplot.get_levels(frame, dims, defn.dimension);
            if(!('x.ordinal' in defn)) {
                defn['x.ordinal'] = (('x.units' in defn) && defn['x.units'] === dc.units.ordinal) ||
                    (levels !== null) || dcplot.looks_ordinal(frame, dims, defn.dimension);
            }

            if(!('x.scale' in defn) && defn['x.ordinal'])
                defn['x.scale'] = d3.scale.ordinal();
            if(!('x.units' in defn) && defn['x.ordinal'])
                defn['x.units'] = dc.units.ordinal;
            if(!('x.domain' in defn) && levels)
                defn['x.domain'] = levels;

            // not a default because we must construct a new object each time
            if(!('x.scale' in defn))
                defn['x.scale'] = levels ? d3.scale.ordinal() : d3.scale.linear();
            if(!('y.scale' in defn))
                defn['y.scale'] = d3.scale.linear();

            // this won't work incrementally out of the box
            if(!('x.domain' in defn) && !('x.elastic' in defn))
                defn['x.elastic'] = true;
            if(!('y.domain' in defn) && !('y.elastic' in defn))
                defn['y.elastic'] = true;
        },
        check_logic: function(definition, defn, dims, groups, errors) {
            // dc.js doesn't require domain but in practice it's needed unless elastic
            if(!defn['x.elastic'] && !('x.domain' in defn))
                throw 'need x.domain unless x.elastic';
            if(!defn['y.elastic'] && !('y.domain' in defn))
                throw 'need y.domain unless y.elastic';
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'margins')) object.chart.margins(defn.margins);
            else object.chart.margins({top: 10, right: 50, bottom: 30, left: 60});
            if(_.has(defn, 'x'))
                object.chart.keyAccessor(dcplot.key_value(dcplot.accessor(frame, defn.x)));
            if(_.has(defn, 'y'))
                object.chart.valueAccessor(dcplot.key_value(dcplot.accessor(frame, defn.y)));

            var xtrans = defn['x.scale'];
            if(_.has(defn, 'x.domain'))
                xtrans.domain(defn['x.domain']);
            object.chart.x(xtrans)
                .xUnits(defn['x.units']);
            if(_.has(defn, 'x.round'))
                object.chart.round(defn['x.round']);
            if(_.has(defn, 'x.elastic'))
                object.chart.elasticX(defn['x.elastic']);
            if(_.has(defn, 'x.padding'))
                object.chart.xAxisPadding(defn['x.padding']);
            if(_.has(defn, 'x.label'))
                object.chart.xAxisLabel(defn['x.label']);

            if(_.has(defn, 'y.scale')) {
                var ytrans = defn['y.scale'];
                if(_.has(defn, 'y.domain'))
                    ytrans.domain(defn['y.domain']);
                object.chart.y(ytrans);
            }
            if(_.has(defn, 'y.elastic'))
                object.chart.elasticY(defn['y.elastic']);
            if(_.has(defn, 'y.padding'))
                object.chart.yAxisPadding(defn['y.padding']);
            if(_.has(defn, 'y.label'))
                object.chart.yAxisLabel(defn['y.label']);

            if(_.has(defn, 'gridLines')) {
                var lines = defn.gridLines;
                if('horizontal' in lines)
                    object.chart.renderVerticalGridLines(lines.horizontal);
                if('vertical' in lines)
                    object.chart.renderVerticalGridLines(lines.vertical);
            }
            if(_.has(defn, 'brush'))
                object.chart.brushOn(defn.brush);
        }
    },
    pie: {
        supported: true,
        concrete: true,
        parents: ['base', 'color'],
        attributes: {
            radius: {required: false},
            innerRadius: {required: false},
            wedge: {required: false}, // keyAccessor (okay these could just be x/y)
            size: {required: false} // valueAccessor
            // etc...
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'wedge'))
                object.chart.keyAccessor(dcplot.key_value(defn.wedge));
            if(_.has(defn, 'size'))
                object.chart.keyAccessor(dcplot.key_value(defn.size));

            if(_.has(defn, 'radius'))
                object.chart.radius(defn.radius);
            if(_.has(defn, 'innerRadius'))
                object.chart.innerRadius(defn.innerRadius);
        }
    },
    row: {
        supported: false,
        parents: ['base', 'color']
    },
    bar: {
        supported: true,
        concrete: true,
        parents: ['coordinateGrid', 'stackable'],
        attributes: {
            width: {default: 700},
            height: {default: 250},
            centerBar: {required: false},
            gap: {required: false},
            'color.x': {default: true}, // color bars individually when not stacked
            'x.units': {required: true} // the most horrible thing EVER
        },
        one_stack: function(defn) {
            return !_.has(defn,'stack.levels') ||
                (_.has(defn,'stack.levels') && defn['stack.levels'].length === 1);
        },
        infer: function(definition, name, frame, defn, dims, groups, errors) {
            /* in practice, dc's xUnits seem to be based on either the bin width
             for a histogram, or the set of ordinals */
            if(!('x.units' in defn) && defn.group) {
                var group = groups[defn.group];
                if(dcplot.mhas(group, 'group', 'binwidth'))
                    defn['x.units'] = dc.units.fp.precision(group.group.binwidth);
            }
            if(!_.has(defn, 'color.domain')) {
                var levels;
                if(this.one_stack(defn)) {
                    if(defn['color.x']) {
                        levels = dcplot.get_levels(frame, dims, defn.dimension);
                        if(levels)
                            defn['color.domain'] = levels;
                    }
                }
                else {
                    levels = dcplot.get_levels(frame, dims, defn.stack);
                    if(levels)
                        defn['color.domain'] = levels;
                }
            }
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'centerBar'))
                object.chart.centerBar(defn.centerBar);
            if(_.has(defn, 'gap'))
                object.chart.gap(defn.gap);
            // optionally color the bars when ordinal and not stacked or one stack
            if(_.has(defn,'x.ordinal') && defn['x.ordinal'] && defn['color.x'] && this.one_stack(defn)) {
                object.chart.renderlet(function(chart) {
                    chart.selectAll('rect.bar').style('fill', function(d,i) {
                        if(d3.select(this).classed(dc.constants.DESELECTED_CLASS))
                            return null;
                        else return chart.colors()(d.x);
                    });
                });
            }
            else if(!this.one_stack(defn)) {
                // dc.js does not automatically color the stacks different colors (!)
                object.chart.renderlet(function(chart) {
                    chart.selectAll('g.'+dc.constants.STACK_CLASS)
                        .each(function(d,i) {
                            var stack = defn['stack.levels'][i];
                            d3.select(this).selectAll('rect.bar')
                                .style('fill', function(d,i) {
                                    if(d3.select(this).classed(dc.constants.DESELECTED_CLASS))
                                        return null;
                                    else return chart.colors()(stack);
                                })
                                .select('title')
                                .text(function(d,i) {
                                    return stack + ', ' + d3.select(this).text();
                                });
                        });
                });
            }
        }
    },
    line: {
        supported: true,
        concrete: true,
        parents: ['coordinateGrid', 'stackable'],
        attributes: {
            width: {default: 800},
            height: {default: 250},
            area: {required: false},
            dotRadius: {required: false}
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'area'))
                object.chart.renderArea(defn.area);
            if(_.has(defn, 'dotRadius'))
                object.chart.dotRadius(defn.dotRadius);
        }
    },
    composite: {
        parents: ['coordinateGrid'],
        supported: false
    },
    abstractBubble: {
        supported: true,
        parents: ['color'],
        attributes: {
            r: {default: 2}, // radiusValueAccessor
            'r.scale': {required: false}, // scale component of r
            'r.domain': {required: false}, // domain component of r
            'r.min': {required: false}
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'r.min'))
                object.chart.minRadius(defn['r.min']);
        }
    },
    bubble: {
        supported: true,
        concrete: true,
        parents: ['coordinateGrid', 'abstractBubble'],
        attributes: {
            width: {default: 400},
            label: {default: null}, // do not label by default; use ..key.. to label with keys
            color: {default: 0}, // by default use first color in palette
            'r.elastic': {required: false}
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            if(_.has(defn, 'r'))
                object.chart.radiusValueAccessor(dcplot.key_value(dcplot.accessor(frame, defn.r)));
            if(_.has(defn, 'r.scale') || _.has(defn, 'r.domain')) {
                var rtrans = defn['r.scale'] || d3.scale.linear();
                rtrans.domain(defn['r.domain'] || [0,100]);
                object.chart.r(rtrans);
            }
        }
    },
    bubbleOverlay: {
        supported: false, // this chart is a crime!
        parents: ['base', 'abstractBubble']
    },
    geoCloropleth: {
        supported: false
    },
    dataCount: {
        supported: false
    },
    dataTable: {
        supported: true,
        concrete: true,
        parents: ['base'],
        attributes: {
            columns: {required: true},
            size: {required: false},
            sortBy: {required: false}
        },
        infer: function(definition, name, frame, defn, dims, groups, errors) {
            var bad = _.find(defn.columns,
                             function(col) { return !frame.has(col); });
            if(bad)
                throw bad + ' not a valid column!';
        },
        create: function(definition, object, groupname, frame, defn, dims, groups, errors) {
            object.chart.group(dcplot.accessor(frame, defn.dimension));
            object.chart.columns(defn.columns.map(dcplot.accessor.bind(null, frame)));
            object.chart.size(defn.size || frame.records().length);
            if(_.has(defn,'sortBy'))
                object.chart.sortBy(dcplot.accessor(frame, defn.sortBy));
        }
    }
};

// Expose d3 and crossfilter, so that clients in browserify
// case can obtain them if they need them.
dcplot.dc = dc;
dcplot.crossfilter = crossfilter;

return dcplot;}
    if(typeof define === "function" && define.amd) {
        define(["dc", "crossfilter", "underscore"], _dcplot);
    } else if(typeof module === "object" && module.exports) {
        var _dc = require('dc');
        var _crossfilter = require('crossfilter');
        var _ = require('underscore');
        // When using npm + browserify, 'crossfilter' is a function,
        // since package.json specifies index.js as main function, and it
        // does special handling. When using bower + browserify,
        // there's no main in bower.json (in fact, there's no bower.json),
        // so we need to fix it.
        if (typeof _crossfilter !== "function") {
            _crossfilter = _crossfilter.crossfilter;
        }
        module.exports = _dcplot(_dc, _crossfilter, _);
    } else {
        this.dc = _dc(dc, crossfilter, _);
    }
}
)();

//# sourceMappingURL=dcplot.js.map