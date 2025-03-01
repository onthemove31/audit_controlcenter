// Initialize the main module and its dependencies
var app = angular.module('auditApp', ['ngRoute']);

// Configure routes
app.config(['$routeProvider', function($routeProvider) {
    $routeProvider
        .when('/', {
            redirectTo: '/login'
        })
        .when('/login', {
            templateUrl: '/templates/login.html',
            controller: 'LoginController'
        })
        .when('/admin', {
            templateUrl: '/templates/admin.html',
            controller: 'AdminController',
            resolve: {
                auth: function($location) {
                    if (!localStorage.getItem('currentUser')) {
                        $location.path('/login');
                    }
                }
            }
        })
        .when('/audit', {
            templateUrl: '/templates/audit.html',
            controller: 'AuditController',
            resolve: {
                auth: function($location) {
                    if (!localStorage.getItem('currentUser')) {
                        $location.path('/login');
                    }
                }
            }
        })
        .otherwise({
            redirectTo: '/login'
        });
}]);
