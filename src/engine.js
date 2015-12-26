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
