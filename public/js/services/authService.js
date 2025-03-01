angular.module('auditApp').service('AuthService', function($http) {
    this.login = function(username) {
        return $http.post('/api/users/login', { username: username })
            .then(function(response) {
                localStorage.setItem('currentUser', JSON.stringify(response.data));
                return response.data;
            });
    };

    this.logout = function() {
        localStorage.removeItem('currentUser');
    };

    this.getCurrentUser = function() {
        const userStr = localStorage.getItem('currentUser');
        return userStr ? JSON.parse(userStr) : null;
    };

    this.isAuthenticated = function() {
        return !!this.getCurrentUser();
    };

    this.isAdmin = function() {
        const user = this.getCurrentUser();
        return user && user.role === 'admin';
    };
});
