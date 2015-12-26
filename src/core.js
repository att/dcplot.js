/* global dcplot, _ */
dcplot.version = '<%= conf.pkg.version %>';

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
    var error_report = d3.select(document.createElement('div'));
    error_report
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
