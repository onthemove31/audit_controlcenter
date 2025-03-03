var app = angular.module('auditApp', ['ngRoute', 'ngSanitize']);

app.config(['$routeProvider', function($routeProvider) {
    $routeProvider
        .when('/', {
            redirectTo: '/login'
        })
        .when('/login', {
            templateUrl: 'templates/login.html',
            controller: 'LoginController'
        })
        .when('/admin', {
            templateUrl: 'templates/admin.html',
            controller: 'AdminController',
            resolve: {
                auth: ['$location', 'AuthService', function($location, AuthService) {
                    if (!AuthService.isAuthenticated()) {
                        $location.path('/login');
                    } else if (!AuthService.isAdmin()) {
                        $location.path('/audit');
                    }
                }]
            }
        })
        .when('/audit', {
            templateUrl: 'templates/audit.html',
            controller: 'AuditController',
            resolve: {
                auth: ['$location', 'AuthService', function($location, AuthService) {
                    if (!AuthService.isAuthenticated()) {
                        $location.path('/login');
                    }
                }]
            }
        })
        .otherwise({
            redirectTo: '/login'
        });
}]);

// Update number formatting configuration
app.config(['$localeProvider', function($localeProvider) {
    var NUMBER_FORMATS = $localeProvider.$get().NUMBER_FORMATS;
    NUMBER_FORMATS.GROUP_SEP = ',';
    NUMBER_FORMATS.PATTERNS[0].gSize = 3;
}]);

// Add error handling
app.run(['$rootScope', '$location', function($rootScope, $location) {
    $rootScope.$on('$routeChangeError', function() {
        console.error('Route change failed');
        $location.path('/login');
    });
}]);
