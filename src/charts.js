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
