var app = angular.module('auditApp', ['ngRoute']);

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
