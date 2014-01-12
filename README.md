# dcplot.js - a minimal interface to dc.js

dcplot.js offers an embedded domain specific language
([EDSL](http://en.wikipedia.org/wiki/Domain-specific_language))
for creating multidimensional charts using [d3.js](https://github.com/mbostock/d3),
[crossfilter](http://square.github.io/crossfilter/), and
[dc.js](http://dc-js.github.io/dc.js/).  Its aim is to provide a tool for
[Exploratory Data Analysis](http://en.wikipedia.org/wiki/Exploratory_data_analysis)
in the browser.

Although dc.js nicely encapsulates the powerful but challenging d3.js library,
there are still a lot of chart parameters, many of which can be defaulted or
inferred from other parameters or from the data.  And it is easy to make a
mistake and end up with no output.  It is more appropriate for presentation
than exploration.

dcplot.js provides a terse JSON-plus-functions declarative language for specifying
crossfilter data and charts all at once. Further, when used with
[RCloud](https://github.com/att/rcloud) through the `wdcplot` wrapper, it provides
an interactive language akin to [ggplot2](http://ggplot2.org/), to generate linked
plots as fast as they can fly off the fingers.

