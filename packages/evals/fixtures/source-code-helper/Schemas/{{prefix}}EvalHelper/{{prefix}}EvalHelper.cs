namespace BPMSoft.Configuration
{
	using BPMSoft.Core;

	public class {{prefix}}EvalHelper
	{
		private readonly UserConnection _userConnection;

		public {{prefix}}EvalHelper(UserConnection userConnection)
		{
			_userConnection = userConnection;
		}

		public string Greet(string name)
		{
			return "Hello, " + name;
		}
	}
}
