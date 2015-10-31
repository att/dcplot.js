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
    var tab;
    if(_.isArray(e)) { // expected exception: input error
        tab = $('<table/>');
        $.each(e, function(i) {
            var err = e[i], formatted_errors = $('<td/>');
            if(_.isString(err.errors))
                formatted_errors.text(err.errors);
            else if(_.isArray(err.errors))
                $.each(err.errors, function(e) {
                    formatted_errors.append($('<p/>').text(err.errors[e]));
                });
            else formatted_errors.text(err.errors.message.toString());
            var name = err.name.replace(/_\d*_\d*$/, '');
            tab.append($('<tr valign=top/>').
                       append($('<td/>').text(err.type)).
                       append($('<td/>').text(name)).
                       append(formatted_errors)
                      );
        });
    }
    else // unexpected exception: probably logic error
        tab = $('<p/>').text(e.toString());
    var error_report = $('<div/>').
            append($('<p/>').text('dcplot errors!')).
            append(tab);
    return error_report;
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
    else throw "illegal accessor " + a.toString();
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
