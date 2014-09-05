// simple illustration of how to use dcplot.js

// nonsense data.  the dataframe can be generated from column-major or row-major data
var data_rows = [
    {x:0, y:0.1},
    {x:0.1, y:0.2},
    {x:0.15, y:0.17},
    {x:0.3, y:0.23},
    {x:0.35, y:0.28},
    {x:0.37, y:0.3},
    {x:0.4, y:0.33},
    {x:0.5, y:0.29},
    {x:0.61, y:0.45},
    {x:0.8, y:0.51}
];

var data_cols = {
    x: [0, 0.1, 0.15, 0.3, 0.35, 0.37, 0.4, 0.5, 0.61, 0.8],
    y: [0.1, 0.2, 0.17, 0.23, 0.28, 0.3, 0.33, 0.29, 0.45, 0.51],
    r: [2, 3, 4, 2, 3, 4, 2, 3, 4, 2],
    c: ['a', 'b', 'c', 'b', 'b', 'a', 'a', 'a', 'b', 'c']
};

// the dataframe is based on the concept from R, here we use R-like column-major data
var frame = dataframe.cols(data_cols);

var cgname = 'chartgroup0';

// some annoying boilerplate to generate the filter display and reset links
// and put them in the chart divs - this could perhaps be automated better by dcplot.js
function make_chart_div(name, group_name) {
    var props = {id: name, style: "float:left"};
    var reset = $('<a/>',
                  {class: 'reset',
                   href: '#',
                   style: "display: none;"})
            .append("reset")
            .click(function(e) {
                e.preventDefault();
                window.charts[name].filterAll();
                dc.redrawAll(group_name);
            });

    return $('<div/>',props)
        .append($('<div/>')
                .append($('<strong/>').append(name))
                .append('&nbsp;&nbsp;')
                .append($('<span/>', {class: 'reset', style: 'display: none;'})
                        .append('Current filter: ')
                        .append($('<span/>', {class: 'filter'})))
                .append('&nbsp;&nbsp;')
                .append(reset)

               );
}

// generate div for each chart
var divs = _.reduce(['bubs', 'lines', 'bars', 'colbars', 'series'],
                    function(memo, dname) {
                        memo[dname] = make_chart_div(dname, cgname);
                        return memo;
                    }, {});


var body = $('body');

// okay now comes the cool part ;-)
// have you ever seen so little code to generate interactive charts?
try {
    window.charts = dcplot(frame, cgname, {
        dimensions: {
            index: frame.index,
            x: 'x',
            x2: 'x',
            col: 'c'
        },
        groups: {
            index: { dimension: 'index' },
            nongroup: {
                dimension: 'x',
                reduce: dcplot.reduce.any('y')
            },
            bingroup: {
                dimension: 'x2',
                group: dcplot.group.bin(0.2)
            },
            colgroup: {
                dimension: 'col'
            }
        },
        charts: {
            bubs: {
                div: divs['bubs'][0],
                type: 'bubble',
                dimension: 'index',
                width: 800,
                x: 'x',
                y: 'y',
                color: 'c',
                r: function(k,v) { return frame.access('r')(k) * v; },
                'r.domain': [1,15],
                label: null
            },
            lines: {
                div: divs['lines'][0],
                type: 'line',
                group: 'nongroup',
                tips: function(x, y) { return x + ', ' + y; }
            },
            bars: {
                div: divs['bars'][0],
                type: 'bar',
                group: 'bingroup'
            },
            colbars: {
                div: divs['colbars'][0],
                type: 'bar',
                group: 'colgroup'
            }
        }});

    $.each(divs,
           function(d) {
               body.append(divs[d]);
           });
}
catch(e) {
    body.append(dcplot.format_error(e));
}

/* note the lines chart could also be expressed this way (more like bubble chart)
            dimension: 'index',
            x: 'x',
            y: 'y',
*/
