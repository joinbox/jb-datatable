'use strict';

angular
.module( 'jb.datatable', [ 'eb.apiWrapper' ] )





/**
* Directive for datatable with filters and search; transcludes the «small» datatable
*/
.directive( 'datatableWithFilters', function() {
    return {
        transclude      : true
        , templateUrl   : 'datatableWithFiltersTemplate.html'
        , controller    : 'DatatableWithFiltersController'
        , link          : function() {

        }
        , scope         : {}
    };
} )


.controller( 'DatatableWithFiltersController', [ '$scope', '$attrs', function( $scope, $attrs ) {

    var self        = this
        , scope     = $scope.$new();




    //
    // FILTERS and SEARCH
    //

    // Selected filters 
    $scope.filters = {
        filter      : undefined
        , search    : undefined
    };


    // Broadcast new searchTerm to table
    $scope.$watch( 'filters.search', function( newValue ) {
        $scope.$broadcast( 'search', { searchTerm: newValue } );
    } );

    // Broadcast filter change to table
    $scope.$watch( 'filters.filter', function( newValue ) {
        $scope.$broadcast( 'filter', { filter: newValue } );
    } );



    // Items for filterList
    $scope.filterList = [];

    $attrs.$observe( 'filterList', function() {
        $scope.filterList = $scope.$parent.$eval( $attrs.filterList );
    } );



} ] )














/**
* Directive to render table (without filter inputs etc.)
*/
.directive( 'datatable', function() {

    return {

        link            : function( scope, element, attrs, DatatableController ) {

            DatatableController.init( element );

        }
        , controller    : 'DatatableController'
        , scope         : {}

    };

} )

.controller( 'DatatableController', [ '$scope', '$rootScope', '$attrs', '$templateCache', '$compile', 'APIWrapperService', function( $scope, $rootScope, $attrs, $templateCache, $compile, APIWrapperService ) {

    var self    = this
        , scope = $scope.$new();


    scope.loading = false;


    //self.datatableWithFiltersController = undefined;


    // Pass original scope down to cell where it might be used by
    // rendering functions
    scope.originalScope = $scope.$parent;


    // Pagination stuff
    self.currentPage        = 0; // Starts with 0
    self.pageCount          = undefined;
    self.resultsPerPage     = undefined;

    // True if there are more results 
    // -> display paginate-right arrow
    self.hasMoreResults     = false;

    // Field definitions, may have attributes: 
    // - content (js function) OR - selector (selects from data)
    // - title (string; title used in table)
    // - searchable (bool)
    self.fields = $scope.fields = [];


    // Search
    self.searchTerm         = undefined;
    self.filter             = undefined;


    // Sort stuff
    self.sortField          = $attrs.order || undefined;
    self.sortOrder          = 'ASC'; // Sort ascending by default




    scope.sortTable = function( field ) {
        // Sort by field that's already sorted by: 
        // Switch order
        if( self.sortField === field ) {
            self.sortOrder = ( self.sortOrder === 'ASC' ) ? 'DESC' : 'ASC';
        }
        else {
            self.sortField = field;
            self.sortorder = 'ASC';
        }
        self.getData();
    };




    // Watch for endpoint, order or filter to change: 
    // call getData()
    $attrs.$observe( function() {
        return $scope.$parent.$eval( $attrs.endpoint ) + $scope.$parent.$eval( $attrs.filter ) + $scope.$parent.$eval( $attrs.order ) + $scope.$parent.$eval( $attrs.fields );
    }, function( newVal ) {

        self.getData();

    } );



    // Watch fields:
    // - set self.fields
    $attrs.$observe( 'fields', function() {

        self.fields         = $scope.$parent.$eval( $attrs.fields );

        // Make titles accessible to html (to render table)
        scope.fields        = self.fields;

        console.log( 'Datatable: Set fields to %o', self.fields );

        self.getData();

    } );



    // Filter changed on datatableWithFilters: Update data
    $scope.$on( 'filter', function( ev, args ) {
        self.filter = args.filter ? args.filter : undefined;
        self.getData();
    } );







    // Search term changed in datatableWithFiltersController
    $scope.$on( 'search', function( ev, args ) {
        self.searchTerm = args.searchTerm;
        self.getData();
    } );





    // Paging 
    this.setResultsPerPage = function( resultsPerPage ) {
        
        console.log( "Datatable: Set results per Page" );

        // Update currentPage so that currently displayed results are still visible
        // in updated table
        if( self.resultsPerPage ) {
            self.currentPage = Math.floor( ( self.currentPage * self.resultsPerPage ) / resultsPerPage);
        }

        self.resultsPerPage = resultsPerPage;

        // Broadcast down the line (to the navigation controller)
        scope.$broadcast( "resultsPerPageChange", { resultsPerPage: resultsPerPage } );
        self.getData();
    };



    // Change current page
    this.changePage = function( direction ) {

        if( self.currentPage + direction > -1 ) {
            self.currentPage += direction;
            self.getData();
        }

    };



    /**
    * Corresponds to directive's link function; render template
    */
    this.init = function( element ) {

        self.$element = element;

        // Render template
        var template    = $( $templateCache.get( 'datatableTemplate.html' ) );
        
        self.$element
            .empty()
            .append( template );

        $compile( template )( scope );

    };






    /**
    * Gets data from server
    */
    this.getData = function() {

        scope.loading = true;

        // Generate headers
        var headers     = {};

        // Order
        if( self.sortField ) {
            headers.order = self.sortField + ' ' + self.sortOrder;
        }
        
        // Select
        headers.select  = getSelectFromFields().join( ',' );

        // Range
        var rangeStart  = self.currentPage * self.resultsPerPage;
        // +1: See if there's a next page
        headers.range   = rangeStart + '-' + ( rangeStart + self.resultsPerPage + 1 );


        // Filter
        if( self.searchTerm || self.filter ) {
            
            var filters = [];


            // Search
            if( self.searchTerm ) {

                // Get fields that may be used for search
                var searchFields = [];
                for( var i = 0; i < self.fields.length; i++ ) {
                    if( self.fields[ i ].searchable && self.fields[ i ].selector ) {
                        searchFields.push( self.fields[ i ].selector );
                    }
                }

                if( searchFields.length > 0 ) {
                    // #todo: serach over multiple fields
                    filters.push( searchFields[ 0 ] + '=like(\'%' + self.searchTerm +  '%\')' );
                }

            }

            // Filter
            if( self.filter ) {
                filters.push( self.filter );
            }

            headers.filter = filters.join( ' AND ' );
            console.error( headers.filter );

        }


        console.log( 'Datatable: headers are %o', headers );

        var url = $scope.$parent.$eval( $attrs.endpoint );
        console.log( 'Datatable: call URL %o', url );

        // Call
        APIWrapperService.request( {
            url         : url
            , method    : 'GET'
            , headers   : headers
        } )
        .then( function( data ) {

            console.log( 'Datatable: Set tableData to %o', data );
            scope.loading = false;

            // Set hasMoreResults
            self.hasMoreResults = data.length > self.resultsPerPage ? true : false;
            if( data.length > self.resultsPerPage ) {
                data = data.splice( 0, self.resultsPerPage );
            }

            scope.$broadcast( 'resultsUpdated', { data: data } );

            scope.tableData = data;




        }, function() {

            $rootScope.$broadcast( 'notification', { 'type': 'error', 'message': 'web.backoffice.loading.error' } );

        } );

    };


    // Parse fields to find out what select headers we have to set
    // Returns an array of the relevant rows
    function getSelectFromFields() {
        
        var select = [];

        // Use loop instead of forEach because of continue
        for( var i = 0; i < self.fields.length; i++ ) {

            var field = self.fields[ i ];

            if( !field || !field.selector || !angular.isString( field.selector ) ) {
                continue;
            }

            var rowName = field.selector.replace( /\.\d+\./gi, '.' );
            select.push( rowName );

        };

        console.log( 'Datatable: Select %o', select );
        return select;

    }


    /**
    * Returns true if table can be ordered by column: 
    * - selector needs to be set
    * - selector may contain no dots
    */
    $scope.isColumnOrderable = function( selector ) {
        return selector && selector.indexOf( '.' ) === -1;
    }

    /**
    * Checks if table is sorted by selector; returns
    * - false
    * - "ASC"
    * - "DESC"
    */
    $scope.isTableOrderedBy = function( selector ) {
        if( self.sortField === selector ) {
            return self.sortOrder === "ASC" ? "ASC" : "DESC";
        }
        else {
            return false;
        }
    }

} ] )






/**
* Directive to render datatable's <tbody> (containing al <tr>s)
*/
.directive( 'datatableBody', function() {
    return {
        templateUrl     : 'datatableRowTemplate.html'
        , controller    : 'DatatableBodyController'
        , require       : ['^datatable', 'datatableBody' ]
        , scope         : {}
        , link          : function( $scope, element, attrs, ctrl ) {
            
            ctrl[ 1 ].init( element, ctrl[ 0 ], ctrl[ 1 ] );

        }
    };
} )

.controller( 'DatatableBodyController', [ '$scope', '$templateCache', '$compile', function( $scope, $templateCache, $compile ) {

    var scope   = $scope.$new()
        , self  = this;

    scope.bodyData = [];


    var element
        , datatableController;


    this.init = function( el, dtController, datatableBodyController ) {

        element = el;
        datatableController = dtController;

        // Render rows as soon as element is available
        self.renderRows();

    };



    // Watch for changes in tableData; render row (as soon as element is available)
    $scope.$watch( '$parent.tableData', function() {
        scope.bodyData = $scope.$parent.tableData;
        console.log( 'Datatable: bodyData is %o', scope.bodyData );
        self.renderRows();
    } );



    this.renderRows = function() {

        if( !element || !scope.bodyData ) {
            return;
        }

        if( !datatableController ) {
            return;
        }

        element.empty();

        scope.bodyData.forEach( function( row ) {
            
            var template = $templateCache.get( 'datatableRowTemplate.html' );

            // Generate new scope for row
            var rowScope = $scope.$new();
            rowScope.data = row;
            rowScope.originalScope = $scope.$parent.originalScope;
            rowScope.fields = datatableController.fields;
            //console.error( 'pass $scope to row: ctrl %o, fields %o; roScope %o', datatableController, datatableController.fields, rowScope );

            var rendered = $compile( template )( rowScope );
            element.append( rendered );

        } );

    };

} ] )







/**
* Directive to render a datatable's row and it's contents
*/
.directive( 'datatableRow', function() {
    return {
        // We can't use require here as parent controllers won't be available
        // (because html code is appended to document dynamically)
        link            : function( $scope, element, attrs, ctrl ) {

            var datatableRowController          = ctrl;
            datatableRowController.init( element );

        }
        , controller    : 'DatatableRowController'
        , scope         : {}
    };
} )

.controller( 'DatatableRowController', [ '$scope', '$templateCache', '$compile', '$attrs', function( $scope, $templateCache, $compile, $attrs ) {

    var self            = this;
    
    // Define variables
    self.data           = undefined;
    self.$element       = undefined;


    // On change of data or fields update cells
    $scope.$watchGroup( [ '$parent.data', '$parent.fields' ], function() {

        self.data       = $scope.$parent.data;
        self.fields     = $scope.$parent.fields;

        self.renderCells();

    } );


    // Called by link function
    this.init = function( element ) {
        self.$element = element;
        self.renderCells();
    };

    // Renders cells with their new scope
    this.renderCells = function() {

        if( !self.fields || !self.fields.length ) {
            return;
        }

        if( !angular.isArray( self.fields ) ) {
            console.warn( 'Datatable: self.fields is not an array in row: %o', self.fields )
            return;
        }

        if( !self.$element ) {
            console.warn( 'Datatable: Can\'t render row, $element is missing' );
            return;
        }

        self.$element.empty();

        self.fields.forEach( function( cellField ) {

            var cellScope           = $scope.$new();
            cellScope.field         = cellField;
            cellScope.data          = self.data;
            cellScope.originalScope = $scope.$parent.originalScope;

            var template    = $templateCache.get( 'datatableCellTemplate.html' )
                , rendered  = $compile( template )( cellScope );

            self.$element.append( rendered );

        } );

    };

} ] )







/**
* Directive for a single cell
*/
.directive( 'datatableCell', function() {

    return {
        controller  : 'DatatableCellController'
        , link      : function( scope, element, attrs, ctrl  ) {
            ctrl.init( element );
        }
    };

} )

.controller( 'DatatableCellController', [ '$scope', '$compile', '$templateCache', function( $scope, $compile, $templateCache ) {

    var self        = this;

    self.$element   = undefined;


    $scope.$watchGroup( [ 'data', 'field' ], function() {
        self.renderCellContent();
    } );


    this.init = function( element ) {

        self.$element = element;
        self.renderCellContent();

    };


    this.renderCellContent = function() {

        var content = getDataByField( $scope.data, $scope.field );

        self.$element
            .empty()

            // Span's needed as angular won't compile without an enclosing tag
            // Don't use a proper template, as we'd need data-ng-bind-html and therefore
            // the angular Sanitizer.
            // Compile against the originalScope so that one may use $scope in the fields
            // definition for ng-click etc.
            .append( $compile( '<span>' + content + '</span>' )( $scope.originalScope ) );

    };



    /*
    * «xpath» for objects. Returns result found in data for a certain path «field».
    * field may be 
    * - name1.name2.name3   for { name1: { name2: { name3: } } }
    * - name.0.content      for { name1: [ { content: } ] }
    * - name=test.content   for { name: test, content: { } }
    */
    function getDataByField( data, field ) {

        // Field content is a function
        if( field.content && angular.isFunction( field.content ) ) {
            return field.content( data );
        }

        // Stuff missing
        if( !field || !data || !field.selector ) {
            console.error( 'Can\'t render cell content; data, field or selector missing in %o/%o', data, field );
            return false;
        }


        // Holds data of last parsed field
        var fieldData   = data

        // Single path (selector) elements
            , paths     = field.selector.split( '.' )
            , result;

        for( var i = 0; i < paths.length; i++ ) {

            var currentPath = paths[ i ];

            // Property is missing
            if( !fieldData[ currentPath ] ) {
                console.log( 'prop missing' );
                result = false;
                break;
            }


            // fieldData[ currentPath ] is object or array
            if( angular.isObject( fieldData[ currentPath ] ) || angular.isArray( fieldData[ currentPath ] ) ) {

                fieldData = fieldData[ currentPath ];
                continue;

            }


            // fieldData[ currentPath ] is string, number, etc.

            // path was last element in paths: Return result
            if( i === paths.length - 1 ) {
                result = fieldData[ currentPath ];
            }

            // path was not last element in paths: path couldn't be found,
            // return false
            else {
                console.log( 'string not last' );
                result = false;
            }

        }

        return result;
            
    }


} ] )








/**
* Renders a date. Requires attributes
* - data-date-renderer
* - data-date-format (YYYY, YY, MM, DD, hh, mm, ss)
* - data-date (some parsable date)
*/
.directive( 'dateRenderer', function() {

    return {
        link: function( $scope, element, attrs ) {

            function pad( nr ) {
                return nr < 10 ? '0' + nr : nr;
            }

            var format = attrs.dateFormat
                , date = new Date( attrs.date );

            var tableDate = format
                .replace( 'YYYY', date.getFullYear() )
                .replace( 'YY', date.getYear() )
                .replace( 'MM', date.getMonth() + 1 )
                .replace( 'DD', date.getDate() )

                .replace( 'hh', pad( date.getHours() ) )
                .replace( 'mm', pad( date.getMinutes() ) )
                .replace( 'ss', pad( date.getSeconds() ) );
    
            element
                .empty()
                .append( tableDate );

        }
    };

} )






/**
* Directive to navigate through the datatable
*/
.directive( 'datatableNavigation', function() {

    return {
        require         : [ 'datatableNavigation', '^datatable' ]
        , controller    : 'DatatableNavigationController'
        , replace       : true
        , templateUrl   : 'datatableNavigationTemplate.html'
        , link          : function( $scope, element, attrs, ctrl ) {

            var navigationController    = ctrl[ 0 ]
                , datatableController   = ctrl[ 1 ];

            navigationController.init( element, datatableController );

        }
    };

} )

.controller( 'DatatableNavigationController', [ '$scope', function( $scope ) {

    var self = this;
    self.datatableController    = undefined;


    // Needs to be in object for UI binding
    $scope.paging = {
        resultsPerPage  : 10
        , showLeft      : true
        , showRight     : true
    };


    $scope.$watch( 'paging.resultsPerPage', function( newValue ) {

        // Datatable controller not yet ready
        if( !self.datatableController ) {
            return;
        }

        self.datatableController.setResultsPerPage( parseInt( newValue, 10 ) );

    } );


    // Results per page changed: Sync back – done on resultsUpdated as well
    /*$scope.$on( 'resultsPerPageChange', function( ev, args ) {
        $scope.paging.resultsPerPage = args.resultsPerPage;
    } );*/


    // New data gotten from server
    $scope.$on( 'resultsUpdated', function( ev, args ) {

        if( !self.datatableController ) {
            return;
        }

        $scope.paging.showRight         = self.datatableController.hasMoreResults;
        $scope.paging.showLeft          = self.datatableController.currentPage > 0;
        $scope.paging.resultsPerPage    = self.datatableController.resultsPerPage;

    } );



    $scope.changePage = function( direction ) {

        self.datatableController.changePage( direction );

    };


    this.init = function( element, datatableController ) {

        self.datatableController = datatableController;

    };


} ] )





/**
* Template for table
*/
.run( function( $templateCache ) {

    $templateCache.put( 'datatableWithFiltersTemplate.html',
        '<form class=\'form-inline\'>' +
            '<input type=\'text\' class=\'form-control\' data-ng-model=\'filters.search\' />' +
            '<select data-ng-show=\'filterList && filterList.length > 0\' name=\'datatable-filter-select\' class=\'form-control\' data-ng-model=\'filters.filter\' data-ng-options=\'filter.filter as filter.name for filter in filterList\'></select>' +
            '<div data-ng-transclude></div>' +
        '</form>'
    );

    $templateCache.put( 'datatableTemplate.html',

        // Progress
        '<div class=\'progress\' data-ng-if=\'loading\'>' +
            '<div class=\'progress-bar progress-bar-striped active\' role=\'progressbar\' style=\'width:100%\'></div>' +
        '</div>' +

        // Table
        '<table class=\'table\' data-ng-if=\'!loading\'>' + // Use bootstrap table class
            '<thead>' +
                '<tr>' +
                    '<th data-ng-repeat=\'field in fields\'>' +
                        //Display button only for fields from database that are sortable
                        '<button class=\'btn btn-link\' data-ng-if=\'isColumnOrderable( field.selector )\' data-ng-click=\'sortTable(field.selector)\'>' +
                            '{{field.title}}' + 
                            '<span data-ng-if=\'isTableOrderedBy( field.selector ) === \"ASC\"\'>&darr;</span>' +
                            '<span data-ng-if=\'isTableOrderedBy( field.selector ) === \"DESC\"\'>&uarr;</span>' +
                        '</button>' +
                        // Non orderable
                        '<span data-ng-if=\'!isColumnOrderable( field.selector )\'>{{field.title}}<span>' + 
                    '</th>' +
                '</tr>' +
            '</thead>' +
            '<tbody data-datatable-body>' +
            '</tbody>' +
        '</table>' +

        // Navigation
        '<nav data-datatable-navigation></nav>'
    
    );

    $templateCache.put( 'datatableNavigationTemplate.html',
        '<nav>' + // Give the navigation it's own directive
            '<form class=\'form-inline\' data-ng-if=\'tableData\'>' + // Needed for bootstrap inline form
                '<button class=\'btn btn-link\' data-ng-click=\'changePage(-1)\' data-ng-show=\'paging.showLeft\'>&larr;</button>' +
                '<button class=\'btn btn-link\' data-ng-click=\'changePage(1)\' data-ng-show=\'paging.showRight\'>&rarr;</button>' +
                '<select name=\'resultsPerPage\' data-ng-model=\'paging.resultsPerPage\' class=\'form-control input-sm\'><option>10</option><option>25</option><option>50</option><option>100</option></select>' +
            '</form>' +
        '</nav>'

    );

    $templateCache.put( 'datatableRowTemplate.html',
        '<tr data-datatable-row data-fields=\'fields\'></tr>'
    );

    $templateCache.put( 'datatableCellTemplate.html',
        '<td data-datatable-cell>' +
        '</td>'
    );

} );
