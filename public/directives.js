app.directive('fileModel', ['$parse', function ($parse) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            var model = $parse(attrs.fileModel);
            var modelSetter = model.assign;
            
            element.bind('change', function() {
                scope.$apply(function() {
                    if (element[0].files.length > 0) {
                        modelSetter(scope, element[0].files[0]);
                    } else {
                        modelSetter(scope, null);
                    }
                });
            });
            
            // Clear file input when model is cleared
            scope.$watch(attrs.fileModel, function(newVal) {
                if (!newVal) {
                    element.val('');
                }
            });
        }
    };
}]);
