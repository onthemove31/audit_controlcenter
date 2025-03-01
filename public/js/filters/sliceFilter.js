angular.module('auditApp')
    .filter('slice', function() {
        return function(arr, start, end) {
            if (!Array.isArray(arr)) return arr;
            return arr.slice(start, end);
        };
    });
